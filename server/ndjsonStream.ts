// 델타 스트림을 NDJSON(delta/done/error 줄) 응답 본문으로 조립하는 순수 함수.
// Bun 전역에 의존하지 않아 vitest에서 취소·에러 경로를 검증할 수 있다.

interface NdjsonStreamOptions {
  deltas: AsyncGenerator<string>;
  finalize: (text: string) => string;
  toErrorMessage: (err: unknown) => string;
  /** 클라이언트가 연결을 끊었을 때 업스트림 요청을 중단하는 훅. */
  onCancel?: () => void;
}

export function createNdjsonStream({
  deltas,
  finalize,
  toErrorMessage,
  onCancel,
}: NdjsonStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        let text = '';
        for await (const delta of deltas) {
          if (cancelled) break;
          text += delta;
          send({ type: 'delta', text: delta });
        }
        if (!cancelled) send({ type: 'done', code: finalize(text) });
      } catch (err) {
        send({ type: 'error', error: toErrorMessage(err) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      onCancel?.();
      // 진행 중인 next()가 끝나면 streamDeltas의 finally가 업스트림 reader를 취소한다.
      void deltas.return(undefined);
    },
  });
}

import { describe, it, expect, vi } from 'vitest';
import { createNdjsonStream } from './ndjsonStream';

async function* fromList(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

async function readLines(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const text = await new Response(stream).text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
}

const toErrorMessage = (err: unknown) => (err instanceof Error ? `에러: ${err.message}` : '알 수 없음');

describe('createNdjsonStream', () => {
  it('델타마다 delta 줄을 보내고 마지막에 finalize 결과를 done 줄로 보낸다', async () => {
    const stream = createNdjsonStream({
      deltas: fromList(['a', 'b']),
      finalize: (text) => `final:${text}`,
      toErrorMessage,
    });
    expect(await readLines(stream)).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'delta', text: 'b' },
      { type: 'done', code: 'final:ab' },
    ]);
  });

  it('델타 소비 중 에러가 나면 error 줄을 보내고 스트림을 닫는다', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'a';
      throw new Error('중간 실패');
    }
    const stream = createNdjsonStream({ deltas: failing(), finalize: (t) => t, toErrorMessage });
    expect(await readLines(stream)).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'error', error: '에러: 중간 실패' },
    ]);
  });

  it('finalize가 던지면 done 대신 error 줄을 보낸다', async () => {
    const stream = createNdjsonStream({
      deltas: fromList(['a']),
      finalize: () => {
        throw new Error('비어 있음');
      },
      toErrorMessage,
    });
    expect(await readLines(stream)).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'error', error: '에러: 비어 있음' },
    ]);
  });

  it('취소하면 onCancel을 호출하고 제너레이터를 정리하며 이후 아무것도 보내지 않는다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let cleaned = false;
    async function* slow(): AsyncGenerator<string> {
      try {
        yield 'a';
        await gate;
        yield 'b';
      } finally {
        cleaned = true;
      }
    }
    const onCancel = vi.fn();
    const stream = createNdjsonStream({ deltas: slow(), finalize: (t) => t, toErrorMessage, onCancel });
    const reader = stream.getReader();

    await reader.read();
    await reader.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cleaned).toBe(true);
  });
});

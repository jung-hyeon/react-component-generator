// 공급자 스트리밍 응답(SSE)을 해석하는 순수 함수들.

/** SSE 버퍼에서 완성된 이벤트의 data 페이로드를 꺼내고, 미완성 조각은 rest로 돌려준다. */
export function splitSseEvents(buffer: string): { payloads: string[]; rest: string } {
  const events = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = events.pop() ?? '';
  const payloads = events
    .map((event) =>
      event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n'),
    )
    .filter((payload) => payload !== '');
  return { payloads, rest };
}

export function extractAnthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type?: string;
    delta?: { type?: string; text?: string; stop_reason?: string };
    error?: { type?: string };
  };
  if (event.type === 'error') {
    throw new Error(`Claude API error: ${event.error?.type ?? 'unknown'}`);
  }
  if (event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

export function extractGoogleDelta(data: string): string {
  const event = JSON.parse(data) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  const candidate = event.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }
  return candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

/** SSE 응답 본문을 읽어 공급자별 extract 함수로 뽑은 텍스트 델타를 순서대로 방출한다. */
export async function* streamDeltas(
  body: ReadableStream<Uint8Array>,
  extract: (data: string) => string,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        // 마지막 이벤트가 빈 줄 없이 끝난 경우를 위해 남은 버퍼도 처리한다.
        buffer += '\n\n';
      } else {
        buffer += decoder.decode(value, { stream: true });
      }
      const { payloads, rest } = splitSseEvents(buffer);
      buffer = rest;
      for (const payload of payloads) {
        const delta = extract(payload);
        if (delta) yield delta;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

import { describe, it, expect } from 'vitest';
import { splitSseEvents, extractAnthropicDelta, extractGoogleDelta, streamDeltas } from './stream';

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
}

describe('streamDeltas', () => {
  it('청크 경계가 이벤트 중간에 걸려도 델타를 순서대로 방출한다', async () => {
    const body = sseBody(['data: {"t":"a"}\n\ndata: {"t', '":"b"}\n\n']);
    const out: string[] = [];
    for await (const delta of streamDeltas(body, (d) => (JSON.parse(d) as { t: string }).t)) {
      out.push(delta);
    }
    expect(out).toEqual(['a', 'b']);
  });

  it('마지막 이벤트가 빈 줄 없이 끝나도 델타를 잃지 않는다', async () => {
    const body = sseBody(['data: {"t":"a"}\n\ndata: {"t":"b"}']);
    const out: string[] = [];
    for await (const delta of streamDeltas(body, (d) => (JSON.parse(d) as { t: string }).t)) {
      out.push(delta);
    }
    expect(out).toEqual(['a', 'b']);
  });

  it('extract가 던지면 업스트림 reader를 취소한다', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: boom\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    const run = async () => {
      for await (const delta of streamDeltas(body, () => {
        throw new Error('boom');
      })) {
        void delta;
      }
    };
    await expect(run()).rejects.toThrow('boom');
    expect(cancelled).toBe(true);
  });

  it('빈 델타는 방출하지 않는다', async () => {
    const body = sseBody(['data: {"t":""}\n\ndata: {"t":"x"}\n\n']);
    const out: string[] = [];
    for await (const delta of streamDeltas(body, (d) => (JSON.parse(d) as { t: string }).t)) {
      out.push(delta);
    }
    expect(out).toEqual(['x']);
  });
});

describe('splitSseEvents', () => {
  it('완성된 이벤트의 data 페이로드를 추출하고 미완성 조각은 rest로 남긴다', () => {
    const { payloads, rest } = splitSseEvents('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"');
    expect(payloads).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c"');
  });

  it('CRLF 구분자도 처리한다', () => {
    const { payloads, rest } = splitSseEvents('event: x\r\ndata: hello\r\n\r\n');
    expect(payloads).toEqual(['hello']);
    expect(rest).toBe('');
  });
});

describe('extractAnthropicDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const data = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '안녕' } });
    expect(extractAnthropicDelta(data)).toBe('안녕');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(extractAnthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('stop_reason이 max_tokens이면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(() => extractAnthropicDelta(data)).toThrow('너무 길어');
  });

  it('error 이벤트는 에러로 던진다', () => {
    const data = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    expect(() => extractAnthropicDelta(data)).toThrow('Claude API error: overloaded_error');
  });
});

describe('extractGoogleDelta', () => {
  it('candidates의 parts 텍스트를 이어 붙인다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(extractGoogleDelta(data)).toBe('ab');
  });

  it('finishReason이 MAX_TOKENS이면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS' }] });
    expect(() => extractGoogleDelta(data)).toThrow('너무 길어');
  });
});

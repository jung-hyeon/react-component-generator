import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { MAX_COMPONENTS } from '../utils/reviveComponents';

const saved = [{ id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' }];

const encoder = new TextEncoder();

function ndjsonResponse(events: unknown[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('useComponentGenerator 스트리밍', () => {
  beforeEach(() => localStorage.clear());

  it('델타를 streamingCode에 누적하고 완료되면 비운 뒤 서버가 보낸 최종 코드를 저장한다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));

    const { result } = renderHook(() => useComponentGenerator());
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.generate('p', 'key', 'google');
    });

    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"delta","text":"const A"}\n'));
    });
    await waitFor(() => expect(result.current.streamingCode).toBe('const A'));
    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"delta","text":" = 1;"}\n'));
    });
    await waitFor(() => expect(result.current.streamingCode).toBe('const A = 1;'));

    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"done","code":"const A = 1;\\nrender(<A />);"}\n'));
      controller.close();
      await promise;
    });

    expect(result.current.streamingCode).toBeNull();
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
    vi.unstubAllGlobals();
  });

  it('생성 중에 다시 generate를 호출하면 요청 없이 false를 반환한다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const fetchMock = vi.fn(async () => new Response(stream));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useComponentGenerator());
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.generate('p', 'key', 'google');
    });

    let second: boolean | undefined;
    await act(async () => {
      second = await result.current.generate('q', 'key', 'google');
    });
    expect(second).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      controller.enqueue(encoder.encode('{"type":"done","code":"render(<A />);"}\n'));
      controller.close();
      await first;
    });
    vi.unstubAllGlobals();
  });

  it('error 이벤트를 받으면 응답 스트림을 취소한다', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('{"type":"error","error":"실패"}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', 'key', 'google');
    });

    expect(cancelled).toBe(true);
    vi.unstubAllGlobals();
  });

  it('error 이벤트를 받으면 false를 반환하고 error 상태에 메시지를 담는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ndjsonResponse([{ type: 'delta', text: 'x' }, { type: 'error', error: '중간 실패' }])),
    );

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('중간 실패');
    expect(result.current.streamingCode).toBeNull();
    expect(result.current.components).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('useComponentGenerator 영속성', () => {
  beforeEach(() => localStorage.clear());

  it('저장된 컴포넌트 목록을 복원하고 createdAt을 Date로 변환한다', () => {
    localStorage.setItem('rcg:components', JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('생성에 성공하면 true를 반환하고, 최대 개수를 넘으면 가장 오래된 항목을 버린다', async () => {
    const full = Array.from({ length: MAX_COMPONENTS }, (_, i) => ({ ...saved[0], id: `c${i}` }));
    localStorage.setItem('rcg:components', JSON.stringify(full));
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([{ type: 'done', code: 'render(<A />);' }])));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(true);
    expect(result.current.components).toHaveLength(MAX_COMPONENTS);
    expect(result.current.components.some((c) => c.id === `c${MAX_COMPONENTS - 1}`)).toBe(false);
    vi.unstubAllGlobals();
  });

  it('생성에 실패하면 false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'fail' }, { status: 500 })));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('컴포넌트를 삭제하면 저장소에도 반영된다', () => {
    localStorage.setItem('rcg:components', JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.removeComponent('1'));
    expect(JSON.parse(localStorage.getItem('rcg:components')!)).toEqual([]);
  });
});

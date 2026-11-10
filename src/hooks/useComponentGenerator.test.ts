import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { MAX_COMPONENTS } from '../utils/reviveComponents';

const saved = [{ id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' }];

const encoder = new TextEncoder();

function ndjsonResponse(events: unknown[]): Response {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson' } });
}

// 테스트가 실패해도 전역 stub이 새거나 열린 스트림이 남지 않도록 afterEach에서 정리한다.
const openControllers: ReadableStreamDefaultController<Uint8Array>[] = [];

function openStream(options: { onCancel?: () => void | Promise<void> } = {}) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => (controller = c),
    cancel: () => options.onCancel?.(),
  });
  openControllers.push(controller);
  return {
    stream,
    controller,
    send: (text: string) => controller.enqueue(encoder.encode(text)),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  openControllers.splice(0).forEach((c) => {
    try {
      c.close();
    } catch {
      // 이미 닫힌 스트림
    }
  });
});

describe('useComponentGenerator 스트리밍', () => {
  beforeEach(() => localStorage.clear());

  it('델타를 streamingCode에 누적하고 완료되면 비운 뒤 서버가 보낸 최종 코드를 저장한다', async () => {
    const { stream, controller, send } = openStream();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));

    const { result } = renderHook(() => useComponentGenerator());
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.generate('p', 'key', 'google');
    });

    await act(async () => send('{"type":"delta","text":"const A"}\n'));
    await waitFor(() => expect(result.current.streamingCode).toBe('const A'));
    await act(async () => send('{"type":"delta","text":" = 1;"}\n'));
    await waitFor(() => expect(result.current.streamingCode).toBe('const A = 1;'));

    await act(async () => {
      send('{"type":"done","code":"const A = 1;\\nrender(<A />);"}\n');
      controller.close();
      await promise;
    });

    expect(result.current.streamingCode).toBeNull();
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
  });

  it('done 이벤트의 코드가 누적 델타와 다르면 done 코드를 저장한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          { type: 'delta', text: '```jsx\nconst Box = () => null;\n```' },
          { type: 'done', code: 'const Box = () => null;\n\nrender(<Box />);' },
        ]),
      ),
    );

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', 'key', 'google');
    });

    expect(result.current.components[0].code).toBe('const Box = () => null;\n\nrender(<Box />);');
  });

  it('청크 경계가 JSON 줄 중간에 걸려도 이벤트를 복원한다', async () => {
    const { stream, controller, send } = openStream();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));

    const { result } = renderHook(() => useComponentGenerator());
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.generate('p', 'key', 'google');
    });

    await act(async () => send('{"type":"delta","te'));
    await act(async () => {
      send('xt":"abc"}\n{"type":"done","code":"abc"}\n');
      controller.close();
      await promise;
    });

    expect(result.current.components[0].code).toBe('abc');
  });

  it('생성 중에 다시 generate를 호출하면 요청 없이 false를 반환한다', async () => {
    const { stream, controller, send } = openStream();
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
      send('{"type":"done","code":"render(<A />);"}\n');
      controller.close();
      await first;
    });

    // 가드가 풀려 다음 생성이 가능하다.
    fetchMock.mockImplementation(async () => ndjsonResponse([{ type: 'done', code: 'render(<B />);' }]));
    let third: boolean | undefined;
    await act(async () => {
      third = await result.current.generate('r', 'key', 'google');
    });
    expect(third).toBe(true);
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
  });

  it('error 이벤트를 받으면 응답 스트림을 취소한다', async () => {
    let cancelled = false;
    const { stream, send } = openStream({ onCancel: () => void (cancelled = true) });
    send('{"type":"error","error":"실패"}\n');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('실패');
    expect(cancelled).toBe(true);
  });

  it('done 없이 스트림이 끝나면 false를 반환하고 끊김 안내를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjsonResponse([{ type: 'delta', text: 'const A' }])));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toContain('중간에 끊어졌습니다');
    expect(result.current.components).toHaveLength(0);
  });

  it('HTTP 오류 응답이 JSON이면 서버 에러 메시지를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: '서버 메시지' }, { status: 400 })));

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', 'key', 'google');
    });

    expect(result.current.error).toBe('서버 메시지');
  });

  it('HTTP 오류 응답이 JSON이 아니면 기본 안내를 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));

    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', 'key', 'google');
    });

    expect(result.current.error).toBe('Failed to generate component');
  });

  it('깨진 NDJSON 줄이 와도 파서 원문 대신 안전한 안내를 보여주고 false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('이건 JSON이 아님\n')));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
    expect(result.current.error).toBe('응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
    expect(result.current.streamingCode).toBeNull();
  });

  it('완료 직전에 응답 스트림 취소가 지연돼도 스트리밍 카드와 새 카드가 동시에 보이는 렌더가 없다', async () => {
    // 닫힌 ReadableStream의 cancel()은 즉시 끝나므로, 지연을 직접 주입하는 가짜 reader를 쓴다.
    const chunks = [encoder.encode('{"type":"done","code":"render(<A />);"}\n')];
    const fakeReader = {
      read: async () => (chunks.length > 0 ? { done: false, value: chunks.shift() } : { done: true, value: undefined }),
      cancel: () => new Promise<void>((resolve) => setTimeout(resolve, 20)),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, body: { getReader: () => fakeReader } })),
    );

    const seen: Array<[number, boolean]> = [];
    const { result } = renderHook(() => {
      const value = useComponentGenerator();
      seen.push([value.components.length, value.streamingCode !== null]);
      return value;
    });

    // act 안에서는 렌더가 act 종료까지 미뤄져 중간 렌더를 볼 수 없으므로 이 테스트만 act 환경을 끈다.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      await result.current.generate('p', 'key', 'google');
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = true;
    }

    expect(result.current.components).toHaveLength(1);
    expect(seen.some(([count, streaming]) => count === 1 && streaming)).toBe(false);
  });
});

describe('useComponentGenerator 중단', () => {
  beforeEach(() => localStorage.clear());

  it('cancel을 호출하면 요청을 abort하고 false를 반환하며 에러 없이 컴포넌트도 추가하지 않는다', async () => {
    const { stream } = openStream();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Response(stream);
      }),
    );

    const { result } = renderHook(() => useComponentGenerator());
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.generate('p', 'key', 'google');
    });
    await waitFor(() => expect(signal).toBeDefined());

    let ok: boolean | undefined;
    await act(async () => {
      result.current.cancel();
      ok = await promise;
    });

    expect(signal?.aborted).toBe(true);
    expect(ok).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.components).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.streamingCode).toBeNull();
  });

  it('언마운트하면 진행 중인 요청을 abort한다', async () => {
    const { stream } = openStream();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Response(stream);
      }),
    );

    const { result, unmount } = renderHook(() => useComponentGenerator());
    act(() => {
      void result.current.generate('p', 'key', 'google');
    });
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
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
  });

  it('생성에 실패하면 false를 반환한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'fail' }, { status: 500 })));

    const { result } = renderHook(() => useComponentGenerator());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.generate('p', 'key', 'google');
    });

    expect(ok).toBe(false);
  });

  it('컴포넌트를 삭제하면 저장소에도 반영된다', () => {
    localStorage.setItem('rcg:components', JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.removeComponent('1'));
    expect(JSON.parse(localStorage.getItem('rcg:components')!)).toEqual([]);
  });
});

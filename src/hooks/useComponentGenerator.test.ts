import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { MAX_COMPONENTS } from '../utils/reviveComponents';

const saved = [{ id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' }];

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
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ code: 'render(<A />);' })));

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

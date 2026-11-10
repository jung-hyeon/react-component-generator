import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';

const saved = [{ id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' }];

describe('useComponentGenerator 영속성', () => {
  beforeEach(() => localStorage.clear());

  it('저장된 컴포넌트 목록을 복원하고 createdAt을 Date로 변환한다', () => {
    localStorage.setItem('rcg:components', JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toHaveLength(1);
    expect(result.current.components[0].createdAt).toBeInstanceOf(Date);
  });

  it('컴포넌트를 삭제하면 저장소에도 반영된다', () => {
    localStorage.setItem('rcg:components', JSON.stringify(saved));
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.removeComponent('1'));
    expect(JSON.parse(localStorage.getItem('rcg:components')!)).toEqual([]);
  });
});

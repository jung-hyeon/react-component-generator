import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentState } from './usePersistentState';

describe('usePersistentState', () => {
  beforeEach(() => localStorage.clear());

  it('저장된 값이 있으면 그 값으로 초기화한다', () => {
    localStorage.setItem('k', JSON.stringify('saved'));
    const { result } = renderHook(() => usePersistentState('k', 'initial'));
    expect(result.current[0]).toBe('saved');
  });

  it('저장된 값이 없으면 초기값을 사용한다', () => {
    const { result } = renderHook(() => usePersistentState('k', 'initial'));
    expect(result.current[0]).toBe('initial');
  });

  it('값을 바꾸지 않았다면 마운트 시 저장소를 덮어쓰지 않는다', () => {
    localStorage.setItem('k', JSON.stringify([1, 'broken', 2]));
    const revive = (raw: unknown) => (raw as unknown[]).filter((v) => typeof v === 'number');
    renderHook(() => usePersistentState<number[]>('k', [], revive));
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual([1, 'broken', 2]);
  });

  it('값을 바꾸면 localStorage에 반영한다', () => {
    const { result } = renderHook(() => usePersistentState('k', 'initial'));
    act(() => result.current[1]('changed'));
    expect(JSON.parse(localStorage.getItem('k')!)).toBe('changed');
  });
});

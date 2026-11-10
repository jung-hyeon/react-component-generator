import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadFromStorage, saveToStorage } from './storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('저장한 값을 다시 읽는다', () => {
    saveToStorage('k', { a: 1 });
    expect(loadFromStorage('k', null)).toEqual({ a: 1 });
  });

  it('저장된 값이 없으면 fallback을 반환한다', () => {
    expect(loadFromStorage('missing', 'fallback')).toBe('fallback');
  });

  it('JSON이 깨져 있으면 fallback을 반환한다', () => {
    localStorage.setItem('k', '{broken');
    expect(loadFromStorage('k', 'fallback')).toBe('fallback');
  });

  it('revive 함수가 있으면 변환된 값을 반환한다', () => {
    saveToStorage('k', 2);
    expect(loadFromStorage('k', 0, (raw) => (raw as number) * 10)).toBe(20);
  });

  it('revive가 예외를 던지면 fallback을 반환한다', () => {
    saveToStorage('k', 2);
    const revive = () => {
      throw new Error('invalid');
    };
    expect(loadFromStorage('k', 'fallback', revive)).toBe('fallback');
  });

  it('저장이 실패해도 예외를 던지지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveToStorage('k', 'v')).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { addToHistory, reviveHistory, MAX_HISTORY } from './history';

describe('reviveHistory', () => {
  it('문자열이 아닌 항목은 제외한다', () => {
    expect(reviveHistory(['a', 1, null, 'b'])).toEqual(['a', 'b']);
  });

  it('공백을 제거하고 빈 문자열은 제외한다', () => {
    expect(reviveHistory(['  a  ', '   ', ''])).toEqual(['a']);
  });

  it('중복은 처음 나온 항목만 남긴다', () => {
    expect(reviveHistory(['a', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('최대 개수를 넘으면 앞쪽(최신)부터 MAX_HISTORY개만 남긴다', () => {
    const many = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => `p${i}`);
    const result = reviveHistory(many);
    expect(result).toHaveLength(MAX_HISTORY);
    expect(result[0]).toBe('p0');
  });

  it('배열이 아니면 예외를 던진다', () => {
    expect(() => reviveHistory('x')).toThrow();
  });
});

describe('addToHistory', () => {
  it('새 프롬프트를 맨 앞에 추가한다', () => {
    expect(addToHistory(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('중복 프롬프트는 기존 항목을 지우고 맨 앞으로 옮긴다', () => {
    expect(addToHistory(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('최대 개수를 넘으면 가장 오래된 항목을 버린다', () => {
    const full = Array.from({ length: MAX_HISTORY }, (_, i) => `p${i}`);
    const result = addToHistory(full, 'new');
    expect(result).toHaveLength(MAX_HISTORY);
    expect(result[0]).toBe('new');
    expect(result).not.toContain(`p${MAX_HISTORY - 1}`);
  });

  it('공백뿐인 프롬프트는 무시한다', () => {
    expect(addToHistory(['a'], '   ')).toEqual(['a']);
  });
});

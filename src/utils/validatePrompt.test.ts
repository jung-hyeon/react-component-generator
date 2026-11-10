import { describe, it, expect } from 'vitest';
import { validatePrompt, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePrompt', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하이면 유효하다', () => {
    expect(validatePrompt('a'.repeat(500))).toEqual({ valid: true });
  });

  it('500자를 넘으면 에러 메시지와 함께 유효하지 않다', () => {
    const result = validatePrompt('a'.repeat(501));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('500');
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePrompt(`  ${'a'.repeat(500)}  `)).toEqual({ valid: true });
  });
});

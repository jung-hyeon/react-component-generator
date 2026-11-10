import { describe, it, expect } from 'vitest';
import { reviveComponents } from './reviveComponents';

const valid = { id: '1', prompt: 'p', code: 'c', createdAt: '2026-01-02T03:04:05.000Z' };

describe('reviveComponents', () => {
  it('createdAt 문자열을 Date로 복원한다', () => {
    const [component] = reviveComponents([valid]);
    expect(component.createdAt).toBeInstanceOf(Date);
    expect(component.createdAt.toISOString()).toBe(valid.createdAt);
  });

  it('필수 필드가 없는 항목은 제외한다', () => {
    expect(reviveComponents([valid, { id: '2' }, null])).toHaveLength(1);
  });

  it('배열이 아니면 예외를 던진다', () => {
    expect(() => reviveComponents({})).toThrow();
  });
});

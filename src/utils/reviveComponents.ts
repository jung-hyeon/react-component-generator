import type { GeneratedComponent } from '../types';

// JSON으로 저장된 컴포넌트 목록을 복원한다. createdAt은 문자열이므로 Date로 되돌린다.
// 배열이 아니면 예외를 던지고, 형식이 맞지 않는 항목은 제외한다.
export function reviveComponents(raw: unknown): GeneratedComponent[] {
  if (!Array.isArray(raw)) {
    throw new Error('저장된 컴포넌트 목록 형식이 올바르지 않습니다.');
  }

  return raw.flatMap((item): GeneratedComponent[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { id, prompt, code, createdAt } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof prompt !== 'string' || typeof code !== 'string') return [];

    const date = new Date(String(createdAt));
    if (Number.isNaN(date.getTime())) return [];

    return [{ id, prompt, code, createdAt: date }];
  });
}

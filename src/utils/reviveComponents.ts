import type { GeneratedComponent } from '../types';

export const MAX_COMPONENTS = 20;

// JSON으로 저장된 컴포넌트 목록을 복원한다. createdAt은 문자열이므로 Date로 되돌린다.
// 배열이 아니면 예외를 던지고, 형식이 맞지 않는 항목은 제외하며, 최대 개수를 적용한다.
export function reviveComponents(raw: unknown): GeneratedComponent[] {
  if (!Array.isArray(raw)) {
    throw new Error('저장된 컴포넌트 목록 형식이 올바르지 않습니다.');
  }

  const components = raw.flatMap((item): GeneratedComponent[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { id, prompt, code, createdAt } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof prompt !== 'string' || typeof code !== 'string') return [];

    const date = new Date(String(createdAt));
    if (Number.isNaN(date.getTime())) return [];

    return [{ id, prompt, code, createdAt: date }];
  });

  return components.slice(0, MAX_COMPONENTS);
}

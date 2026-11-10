export const MAX_HISTORY = 10;

// 최신 프롬프트가 맨 앞에 오도록 추가하고, 중복은 제거하며, 최대 개수를 유지한다.
export function addToHistory(history: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
}

// 저장된 히스토리를 복원한다. 문자열만 남기고 공백 제거, 중복 제거, 최대 개수를 적용한다.
export function reviveHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error('저장된 히스토리 형식이 올바르지 않습니다.');
  }
  const cleaned = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(cleaned)].slice(0, MAX_HISTORY);
}

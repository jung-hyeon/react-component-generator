export const MAX_HISTORY = 10;

// 최신 프롬프트가 맨 앞에 오도록 추가하고, 중복은 제거하며, 최대 개수를 유지한다.
export function addToHistory(history: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((item) => item !== trimmed)].slice(0, MAX_HISTORY);
}

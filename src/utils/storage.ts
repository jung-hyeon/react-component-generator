export const STORAGE_KEYS = {
  apiKey: 'rcg:apiKey',
  provider: 'rcg:provider',
  history: 'rcg:history',
  components: 'rcg:components',
} as const;

// 저장된 값이 없거나 깨졌거나 revive가 예외를 던지면 fallback을 반환한다.
export function loadFromStorage<T>(key: string, fallback: T, revive?: (raw: unknown) => T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const raw: unknown = JSON.parse(stored);
    return revive ? revive(raw) : (raw as T);
  } catch {
    return fallback;
  }
}

// 용량 초과나 저장소 비활성화로 실패해도 앱 동작을 막지 않는다.
export function saveToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시한다.
  }
}

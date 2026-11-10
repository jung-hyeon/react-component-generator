import { useState, useEffect, useRef } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';

export function usePersistentState<T>(key: string, initial: T, revive?: (raw: unknown) => T) {
  const [state, setState] = useState<T>(() => loadFromStorage(key, initial, revive));
  // 불러온 직후 값은 저장하지 않는다. 일부만 유효한 원본 데이터가 걸러진 값으로 덮어써지는 것을 막는다.
  const loadedRef = useRef(state);

  useEffect(() => {
    if (Object.is(state, loadedRef.current)) return;
    saveToStorage(key, state);
  }, [key, state]);

  return [state, setState] as const;
}

import { useState, useEffect } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';

export function usePersistentState<T>(key: string, initial: T, revive?: (raw: unknown) => T) {
  const [state, setState] = useState<T>(() => loadFromStorage(key, initial, revive));

  useEffect(() => {
    saveToStorage(key, state);
  }, [key, state]);

  return [state, setState] as const;
}

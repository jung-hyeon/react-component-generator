import { useState, useCallback, useRef } from 'react';
import { usePersistentState } from './usePersistentState';
import { STORAGE_KEYS } from '../utils/storage';
import { reviveComponents, MAX_COMPONENTS } from '../utils/reviveComponents';
import { splitNdjson } from '../utils/ndjson';
import type { GeneratedComponent, Provider } from '../types';

type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  isLoading: boolean;
  error: string | null;
  /** 생성 중에 누적되는 코드. 생성 중이 아니면 null. */
  streamingCode: string | null;
  streamingPrompt: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<boolean>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = usePersistentState<GeneratedComponent[]>(
    STORAGE_KEYS.components,
    [],
    reviveComponents,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingCode, setStreamingCode] = useState<string | null>(null);
  const [streamingPrompt, setStreamingPrompt] = useState<string | null>(null);
  const inFlight = useRef(false);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider): Promise<boolean> => {
    // 진행 중 재진입을 막아 두 호출이 서로의 스트리밍 상태를 덮어쓰지 않게 한다.
    if (inFlight.current) return false;
    inFlight.current = true;

    setIsLoading(true);
    setError(null);
    setStreamingPrompt(prompt);
    setStreamingCode('');
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamed = '';
      let finalCode: string | null = null;

      const handle = (event: StreamEvent) => {
        if (event.type === 'delta') {
          streamed += event.text;
          setStreamingCode(streamed);
        } else if (event.type === 'done') {
          finalCode = event.code;
        } else if (event.type === 'error') {
          throw new Error(event.error);
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = splitNdjson(buffer);
        buffer = rest;
        (events as StreamEvent[]).forEach(handle);
      }

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊어졌습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      setComponents((prev) => [newComponent, ...prev].slice(0, MAX_COMPONENTS));
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      await reader?.cancel().catch(() => {});
      inFlight.current = false;
      setIsLoading(false);
      setStreamingCode(null);
      setStreamingPrompt(null);
    }
  }, [setComponents]);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, isLoading, error, streamingCode, streamingPrompt, generate, removeComponent, clearAll };
}

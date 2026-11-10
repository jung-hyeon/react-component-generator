import { useState, useCallback, useEffect, useRef } from 'react';
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
  /** 진행 중인 생성을 중단한다. */
  cancel: () => void;
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
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider): Promise<boolean> => {
    // 진행 중 재진입을 막아 두 호출이 서로의 스트리밍 상태를 덮어쓰지 않게 한다.
    if (inFlight.current) return false;
    inFlight.current = true;

    setIsLoading(true);
    setError(null);
    setStreamingPrompt(prompt);
    setStreamingCode('');
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    // cancel()과 언마운트가 요청과 응답 스트림을 함께 중단한다.
    const controller = new AbortController();
    abortRef.current = controller;
    controller.signal.addEventListener('abort', () => void reader?.cancel().catch(() => {}));

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
        signal: controller.signal,
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
        let parsed: ReturnType<typeof splitNdjson>;
        try {
          parsed = splitNdjson(buffer);
        } catch {
          throw new Error('응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
        }
        buffer = parsed.rest;
        (parsed.events as StreamEvent[]).forEach(handle);
      }

      if (controller.signal.aborted) return false;

      if (finalCode === null) {
        throw new Error('응답이 중간에 끊어졌습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        prompt,
        code: finalCode,
        createdAt: new Date(),
      };

      // 스트리밍 카드를 걷어내는 것과 새 카드를 추가하는 것을 한 번에 반영해 두 카드가 동시에 보이지 않게 한다.
      setStreamingCode(null);
      setStreamingPrompt(null);
      setComponents((prev) => [newComponent, ...prev].slice(0, MAX_COMPONENTS));
      return true;
    } catch (err) {
      // 사용자가 중단한 경우는 에러로 보여주지 않는다.
      if (controller.signal.aborted) return false;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      abortRef.current = null;
      await reader?.cancel().catch(() => {});
      inFlight.current = false;
      setIsLoading(false);
      setStreamingCode(null);
      setStreamingPrompt(null);
    }
  }, [setComponents]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, [setComponents]);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, [setComponents]);

  return { components, isLoading, error, streamingCode, streamingPrompt, generate, cancel, removeComponent, clearAll };
}

// 생성 요청 본문을 검증하는 순수 함수. /api/generate와 /api/generate/stream이 공유한다.

export const MAX_PROMPT_LENGTH = 4000;

export type Provider = 'anthropic' | 'google';

export type ParsedRequest =
  | { ok: true; value: { prompt: string; apiKey: string | undefined; provider: Provider } }
  | { ok: false; error: string; status: number };

const PROVIDERS: readonly string[] = ['anthropic', 'google'];

function invalid(error: string): ParsedRequest {
  return { ok: false, error, status: 400 };
}

export function parseGenerateRequest(raw: unknown): ParsedRequest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid('요청 본문이 올바르지 않습니다.');
  }
  const { prompt, apiKey, provider = 'anthropic' } = raw as Record<string, unknown>;

  if (typeof provider !== 'string' || !PROVIDERS.includes(provider)) {
    return invalid('지원하지 않는 AI 서비스입니다.');
  }
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return invalid('Prompt is required');
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return invalid(`프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.`);
  }
  if (apiKey !== undefined && typeof apiKey !== 'string') {
    return invalid('API 키 형식이 올바르지 않습니다.');
  }

  return { ok: true, value: { prompt, apiKey, provider: provider as Provider } };
}

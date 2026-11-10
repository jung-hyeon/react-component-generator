import { stripCodeFences, ensureRenderCall, finalizeCode } from './generator';
import { withModelFallback } from './fallback';
import { toErrorInfo } from './errors';
import { streamDeltas, extractAnthropicDelta, extractGoogleDelta } from './stream';
import { createNdjsonStream } from './ndjsonStream';
import { parseGenerateRequest } from './request';
import type { Provider } from './request';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

// 본문 파싱·검증·키 확인을 두 엔드포인트가 공유한다. 실패하면 바로 반환할 응답을 돌려준다.
async function readGenerateRequest(
  req: Request,
): Promise<{ response: Response } | { prompt: string; provider: Provider; resolvedKey: string }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      response: Response.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400, headers: CORS_HEADERS }),
    };
  }

  const parsed = parseGenerateRequest(raw);
  if (!parsed.ok) {
    return { response: Response.json({ error: parsed.error }, { status: parsed.status, headers: CORS_HEADERS }) };
  }

  const { prompt, apiKey, provider } = parsed.value;
  const resolvedKey = resolveApiKey(provider, apiKey);
  if (!resolvedKey) {
    return {
      response: Response.json(
        { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
        { status: 400, headers: CORS_HEADERS }
      ),
    };
  }
  return { prompt, provider, resolvedKey };
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function callGoogleModel(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates: Array<{
      content: { parts: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }

  return (
    candidate?.content?.parts
      ?.map((part) => part.text)
      ?.join('') ?? ''
  );
}

async function callGoogle(prompt: string, apiKey: string): Promise<string> {
  return withModelFallback(GOOGLE_MODELS, (model) => callGoogleModel(prompt, apiKey, model));
}

// 스트리밍 경로. 응답 본문이 열리기 전(HTTP 오류)에만 모델 폴백이 가능하다.
type Deltas = AsyncGenerator<string>;

async function streamAnthropic(prompt: string, apiKey: string, signal: AbortSignal): Promise<Deltas> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Claude API error: ${response.status}`);
  }
  return streamDeltas(response.body, extractAnthropicDelta);
}

async function streamGoogleModel(prompt: string, apiKey: string, model: string, signal: AbortSignal): Promise<Deltas> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini API error: ${response.status}`);
  }
  return streamDeltas(response.body, extractGoogleDelta);
}

async function streamGoogle(prompt: string, apiKey: string, signal: AbortSignal): Promise<Deltas> {
  return withModelFallback(GOOGLE_MODELS, (model) => streamGoogleModel(prompt, apiKey, model, signal));
}

const NDJSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache',
};

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate/stream') {
      try {
        const parsed = await readGenerateRequest(req);
        if ('response' in parsed) return parsed.response;
        const { prompt, provider, resolvedKey } = parsed;

        // 클라이언트 연결 종료(req.signal)와 스트림 취소 모두 업스트림 fetch를 중단한다.
        const upstream = new AbortController();
        req.signal.addEventListener('abort', () => upstream.abort());

        // 본문이 열리기 전 실패는 일반 JSON 에러 응답으로 돌려준다.
        const deltas =
          provider === 'google'
            ? await streamGoogle(prompt, resolvedKey, upstream.signal)
            : await streamAnthropic(prompt, resolvedKey, upstream.signal);

        const body = createNdjsonStream({
          deltas,
          finalize: finalizeCode,
          toErrorMessage: (err) => toErrorInfo(err).message,
          onCancel: () => upstream.abort(),
        });

        return new Response(body, { headers: NDJSON_HEADERS });
      } catch (err) {
        const { message, status } = toErrorInfo(err);
        return Response.json({ error: message }, { status, headers: CORS_HEADERS });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const parsed = await readGenerateRequest(req);
        if ('response' in parsed) return parsed.response;
        const { prompt, provider, resolvedKey } = parsed;

        const text =
          provider === 'google'
            ? await callGoogle(prompt, resolvedKey)
            : await callAnthropic(prompt, resolvedKey);

        const code = ensureRenderCall(stripCodeFences(text));

        return Response.json({ code }, { headers: CORS_HEADERS });
      } catch (err) {
        const { message, status } = toErrorInfo(err);
        return Response.json({ error: message }, { status, headers: CORS_HEADERS });
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);

export const MAX_PROMPT_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  error?: string;
}

// 서버로 전송되는 값(trim 후)을 기준으로 길이를 검증한다.
export function validatePrompt(prompt: string): PromptValidation {
  if (prompt.trim().length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `프롬프트는 ${MAX_PROMPT_LENGTH}자를 넘을 수 없습니다.` };
  }
  return { valid: true };
}

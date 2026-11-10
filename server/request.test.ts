import { describe, it, expect } from 'vitest';
import { parseGenerateRequest, MAX_PROMPT_LENGTH } from './request';

describe('parseGenerateRequest', () => {
  it('올바른 본문은 prompt, apiKey, provider를 반환한다', () => {
    expect(parseGenerateRequest({ prompt: '버튼', apiKey: 'k', provider: 'google' })).toEqual({
      ok: true,
      value: { prompt: '버튼', apiKey: 'k', provider: 'google' },
    });
  });

  it('provider를 생략하면 anthropic을 기본값으로 쓴다', () => {
    const result = parseGenerateRequest({ prompt: '버튼' });
    expect(result).toEqual({ ok: true, value: { prompt: '버튼', apiKey: undefined, provider: 'anthropic' } });
  });

  it('본문이 객체가 아니면 400을 반환한다', () => {
    expect(parseGenerateRequest(null)).toMatchObject({ ok: false, status: 400 });
    expect(parseGenerateRequest('문자열')).toMatchObject({ ok: false, status: 400 });
  });

  it('허용되지 않은 provider는 400을 반환한다', () => {
    expect(parseGenerateRequest({ prompt: 'p', provider: 'x' })).toMatchObject({ ok: false, status: 400 });
    expect(parseGenerateRequest({ prompt: 'p', provider: '__proto__' })).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 문자열이 아니거나 비어 있으면 400을 반환한다', () => {
    expect(parseGenerateRequest({ prompt: [1] })).toMatchObject({ ok: false, status: 400 });
    expect(parseGenerateRequest({ prompt: '   ' })).toMatchObject({ ok: false, status: 400 });
    expect(parseGenerateRequest({})).toMatchObject({ ok: false, status: 400 });
  });

  it('prompt가 길이 상한을 넘으면 400을 반환한다', () => {
    const result = parseGenerateRequest({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('apiKey가 문자열이 아니면 400을 반환한다', () => {
    expect(parseGenerateRequest({ prompt: 'p', apiKey: 123 })).toMatchObject({ ok: false, status: 400 });
  });
});

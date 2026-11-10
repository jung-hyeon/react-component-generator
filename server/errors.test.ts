import { describe, it, expect } from 'vitest';
import { toErrorInfo } from './errors';

describe('toErrorInfo', () => {
  it('메시지에 503이 있으면 과부하 안내와 503을 반환한다', () => {
    expect(toErrorInfo(new Error('Gemini API error: 503'))).toEqual({
      message: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      status: 503,
    });
  });

  it('메시지에 429가 있으면 요청 과다 안내와 429를 반환한다', () => {
    expect(toErrorInfo(new Error('Claude API error: 429'))).toEqual({
      message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      status: 429,
    });
  });

  it('메시지에 URL 쿼리의 API 키가 있으면 가려서 반환한다', () => {
    const err = new Error('fetch failed: https://generativelanguage.googleapis.com/v1beta/models/m:streamGenerateContent?alt=sse&key=AIzaSECRET123');
    const { message } = toErrorInfo(err);
    expect(message).not.toContain('AIzaSECRET123');
    expect(message).toContain('key=***');
  });

  it('그 외에는 원래 메시지와 500을 반환한다', () => {
    expect(toErrorInfo(new Error('기타 오류'))).toEqual({ message: '기타 오류', status: 500 });
    expect(toErrorInfo('문자열')).toEqual({ message: 'Unknown error', status: 500 });
  });
});

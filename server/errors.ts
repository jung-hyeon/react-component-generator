// 에러 메시지의 HTTP 상태 코드(503/429)로 사용자 안내와 응답 상태를 정한다.
export function toErrorInfo(err: unknown): { message: string; status: number } {
  // Google 호출은 API 키가 URL 쿼리에 들어가므로 네트워크 오류 메시지에서 가린다.
  const message = (err instanceof Error ? err.message : 'Unknown error').replace(/key=[^&\s"']+/g, 'key=***');

  if (message.includes('503')) {
    return { message: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.', status: 503 };
  }
  if (message.includes('429')) {
    return { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', status: 429 };
  }
  return { message, status: 500 };
}

// 스트리밍 응답 버퍼에서 완성된 줄(JSON)만 파싱하고, 미완성 조각은 rest로 돌려준다.
export function splitNdjson(buffer: string): { events: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events = lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line) as unknown);
  return { events, rest };
}

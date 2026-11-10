import { describe, it, expect } from 'vitest';
import { splitNdjson } from './ndjson';

describe('splitNdjson', () => {
  it('완성된 줄을 JSON으로 파싱하고 미완성 조각은 rest로 남긴다', () => {
    const { events, rest } = splitNdjson('{"type":"delta","text":"a"}\n{"type":"done"}\n{"type":"del');
    expect(events).toEqual([{ type: 'delta', text: 'a' }, { type: 'done' }]);
    expect(rest).toBe('{"type":"del');
  });

  it('빈 줄은 무시한다', () => {
    const { events, rest } = splitNdjson('\n{"type":"done"}\n\n');
    expect(events).toEqual([{ type: 'done' }]);
    expect(rest).toBe('');
  });
});

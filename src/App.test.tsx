import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

function mockFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/config') {
        return Response.json({ envKeys: { anthropic: false, google: false } });
      }
      return new Response('{"type":"done","code":"const A = () => null;\\nrender(<A />);"}\n');
    }),
  );
}

describe('App 스트리밍 UX', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('생성 중에는 코드 탭에 실시간 코드를 보여주고, 완료되면 미리보기 탭으로 전환한다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    const encoder = new TextEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/config'
          ? Response.json({ envKeys: { anthropic: false, google: false } })
          : new Response(stream),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API 키'), 'AIza-test');
    await user.type(screen.getByRole('textbox'), '버튼');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    controller.enqueue(encoder.encode('{"type":"delta","text":"const Btn = () => null;"}\n'));
    expect(await screen.findByText('const Btn = () => null;')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '코드' })).toHaveAttribute('aria-selected', 'true');

    controller.enqueue(
      encoder.encode('{"type":"done","code":"const Btn = () => null;\\nrender(<Btn />);"}\n'),
    );
    controller.close();

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: '미리보기' })).toHaveAttribute('aria-selected', 'true'),
    );
  });

  it('생성 중 중단 버튼을 누르면 스트리밍 카드가 사라지고 에러 없이 히스토리에도 저장되지 않는다', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"delta","text":"const Btn"}\n'));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/config'
          ? Response.json({ envKeys: { anthropic: false, google: false } })
          : new Response(stream),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API 키'), 'AIza-test');
    await user.type(screen.getByRole('textbox'), '버튼');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));
    await screen.findByText('const Btn');

    await user.click(screen.getByRole('button', { name: '생성 중단' }));

    await waitFor(() => expect(screen.queryByLabelText('컴포넌트 생성 중')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('rcg:history') ?? '[]')).toEqual([]);
  });
});

describe('App 영속성', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('저장된 Provider를 복원하고 저장된 API 키 값은 무시한다', () => {
    localStorage.setItem('rcg:provider', JSON.stringify('anthropic'));
    localStorage.setItem('rcg:apiKey', JSON.stringify('sk-ant-test'));
    render(<App />);

    expect(screen.getByLabelText('AI 서비스')).toHaveValue('anthropic');
    expect(screen.getByLabelText('API 키')).toHaveValue('');
  });

  it('저장된 Provider 값이 유효하지 않으면 기본값(google)을 사용한다', () => {
    localStorage.setItem('rcg:provider', JSON.stringify('unknown'));
    render(<App />);
    expect(screen.getByLabelText('AI 서비스')).toHaveValue('google');
  });

  it('Provider를 바꾸면 저장소에 반영하고 API 키는 저장하지 않는다', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('API 키'), { target: { value: 'AIza-test' } });
    expect(localStorage.getItem('rcg:apiKey')).toBeNull();

    fireEvent.change(screen.getByLabelText('AI 서비스'), { target: { value: 'anthropic' } });
    expect(JSON.parse(localStorage.getItem('rcg:provider')!)).toBe('anthropic');
  });

  it('생성에 실패한 프롬프트는 히스토리에 저장하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === '/api/config'
          ? Response.json({ envKeys: { anthropic: false, google: false } })
          : Response.json({ error: 'fail' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API 키'), 'AIza-test');
    await user.type(screen.getByRole('textbox'), '실패할 프롬프트');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByRole('alert');
    expect(JSON.parse(localStorage.getItem('rcg:history') ?? '[]')).toEqual([]);
  });

  it('생성 요청한 프롬프트가 히스토리에 저장된다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText('API 키'), 'AIza-test');
    await user.type(screen.getByRole('textbox'), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rcg:history')!)).toEqual(['프로필 카드']),
    );
  });
});

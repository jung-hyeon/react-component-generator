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
      return Response.json({ code: 'const A = () => null;\nrender(<A />);' });
    }),
  );
}

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

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

  it('저장된 Provider와 API 키를 복원한다', () => {
    localStorage.setItem('rcg:provider', JSON.stringify('anthropic'));
    localStorage.setItem('rcg:apiKey', JSON.stringify('sk-ant-test'));
    render(<App />);

    expect(screen.getByLabelText('AI 서비스')).toHaveValue('anthropic');
    expect(screen.getByLabelText('API 키')).toHaveValue('sk-ant-test');
  });

  it('저장된 Provider 값이 유효하지 않으면 기본값(google)을 사용한다', () => {
    localStorage.setItem('rcg:provider', JSON.stringify('unknown'));
    render(<App />);
    expect(screen.getByLabelText('AI 서비스')).toHaveValue('google');
  });

  it('Provider와 API 키를 바꾸면 저장소에 반영한다', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('API 키'), { target: { value: 'AIza-test' } });
    expect(JSON.parse(localStorage.getItem('rcg:apiKey')!)).toBe('AIza-test');

    fireEvent.change(screen.getByLabelText('AI 서비스'), { target: { value: 'anthropic' } });
    expect(JSON.parse(localStorage.getItem('rcg:provider')!)).toBe('anthropic');
  });

  it('생성 요청한 프롬프트가 히스토리에 저장된다', async () => {
    localStorage.setItem('rcg:apiKey', JSON.stringify('AIza-test'));
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('rcg:history')!)).toEqual(['프로필 카드']),
    );
  });
});

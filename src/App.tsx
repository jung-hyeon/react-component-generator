import { useState, useEffect } from 'react';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { StreamingCard } from './components/StreamingCard';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import { usePersistentState } from './hooks/usePersistentState';
import { STORAGE_KEYS } from './utils/storage';
import { addToHistory, reviveHistory } from './utils/history';
import type { Provider } from './types';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

function reviveProvider(raw: unknown): Provider {
  if (raw === 'anthropic' || raw === 'google') return raw;
  throw new Error('저장된 Provider 값이 올바르지 않습니다.');
}

function App() {
  // API 키는 XSS와 생성 코드의 접근 위험 때문에 저장하지 않는다.
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [provider, setProvider] = usePersistentState<Provider>(STORAGE_KEYS.provider, 'google', reviveProvider);
  const [history, setHistory] = usePersistentState<string[]>(STORAGE_KEYS.history, [], reviveHistory);
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const { components, isLoading, error, streamingCode, streamingPrompt, generate, cancel, removeComponent, clearAll } =
    useComponentGenerator();

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = async (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    const succeeded = await generate(prompt, apiKey || undefined, provider);
    if (succeeded) {
      setHistory((prev) => addToHistory(prev, prompt));
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey('');
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <div className="app">
      <header className="menubar">
        <strong className="menubar-title">컴포넌트 생성기</strong>
        <div className="menubar-status" aria-label="현재 작업 상태">
          <span>{activeProvider}</span>
          <span>{components.length}개 생성됨</span>
        </div>
      </header>

      <main className="workspace">
        <section className="window composer-panel" aria-label="컴포넌트 생성">
          <div className="titlebar">
            <span className="titlebar-label">프롬프트</span>
          </div>
          <div className="window-body">
            <PromptInput onGenerate={handleGenerate} isLoading={isLoading} history={history} />
          </div>
        </section>

        <aside className="window settings-panel" aria-label="실행 설정">
          <div className="titlebar">
            <span className="titlebar-label">환경설정</span>
          </div>
          <div className="window-body">
            <div className="provider-select">
              <label htmlFor="provider">AI 서비스</label>
              <select
                id="provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as Provider)}
              >
                {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="api-key-input">
              <label htmlFor="api-key">API 키</label>
              <div className="api-key-field">
                <input
                  id="api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    hasEnvKey
                      ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                      : PROVIDER_CONFIG[provider].placeholder
                  }
                />
                <button
                  className="btn-toggle-key"
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? '숨기기' : '보기'}
                </button>
              </div>
              <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
                {hasEnvKey ? '.env 키가 연결되어 있습니다.' : '직접 입력하거나 서버 환경변수를 설정하세요.'}
              </p>
            </div>
          </div>
        </aside>
      </main>

      {error && (
        <div className="error-banner" role="alert">
          <p>{error}</p>
        </div>
      )}

      <section className="results-section">
        {components.length > 0 && (
          <div className="results-header">
            <h2>생성된 컴포넌트</h2>
            <button className="btn-clear" onClick={clearAll}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <div className="empty-state">
            <p className="empty-prompt" aria-hidden="true">
              C:\&gt;<span className="caret" />
            </p>
            <h2>아직 만든 컴포넌트가 없습니다.</h2>
            <p>프롬프트 창에 만들고 싶은 UI를 적고 컴포넌트 생성을 누르세요.</p>
          </div>
        )}

        <div className="results-grid">
          {isLoading && streamingCode !== null && (
            <StreamingCard prompt={streamingPrompt ?? ''} code={streamingCode} onCancel={cancel} />
          )}
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;

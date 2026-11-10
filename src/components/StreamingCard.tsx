import { useEffect, useRef } from 'react';

interface StreamingCardProps {
  prompt: string;
  code: string;
  onCancel: () => void;
}

// 생성 중인 컴포넌트 카드. 코드 탭이 선택된 상태로 응답 코드를 실시간 표시한다.
// 완료되면 App이 이 카드를 ComponentCard(기본 탭: 미리보기)로 교체한다.
export function StreamingCard({ prompt, code, onCancel }: StreamingCardProps) {
  const blockRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const block = blockRef.current;
    if (block) block.scrollTop = block.scrollHeight;
  }, [code]);

  return (
    <div className="window component-card" role="status" aria-label="컴포넌트 생성 중">
      <div className="titlebar">
        <span className="titlebar-label">생성 중...</span>
      </div>
      <div className="card-header">
        <p className="card-prompt">{prompt}</p>
        <div className="card-actions">
          <button className="btn-remove" onClick={onCancel}>
            생성 중단
          </button>
        </div>
      </div>
      <div className="card-tabs" role="tablist">
        <button className="tab" role="tab" aria-selected="false" disabled>
          미리보기
        </button>
        <button className="tab tab--active" role="tab" aria-selected="true">
          코드
        </button>
      </div>
      <div className="card-content">
        <pre className="code-block code-block--streaming" ref={blockRef}>
          <code>{code || '응답을 기다리는 중...'}</code>
          <span className="caret caret--light" aria-hidden="true" />
        </pre>
      </div>
    </div>
  );
}

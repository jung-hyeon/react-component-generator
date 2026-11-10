# src/AGENTS.md

## Module Context

Vite + React 19 프론트엔드. `/api/*`는 Vite 프록시를 거쳐 `server/`로 전달된다 (`../vite.config.ts`). 루트 규칙은 `../AGENTS.md` 참고.

## Tech Stack and Constraints

- 상태 관리 라이브러리 없이 `useState`와 커스텀 훅만 사용한다. 서버 통신은 `fetch`만 사용한다 (`hooks/useComponentGenerator.ts:43`).
- 스타일은 전역 CSS와 클래스명(`App.css`, `index.css`)을 쓴다. CSS 모듈이나 CSS-in-JS를 추가하지 않는다. 색상은 `index.css`의 `:root` 변수(`--ink`, `--window` 등)를 사용하고 값을 직접 하드코딩하지 않는다.
- 폰트는 `galmuri` 패키지를 `index.css`의 `@font-face`로 로드한다 (`index.css:1-20`). 다른 웹폰트를 추가하지 않는다.
- tsconfig 제약 (`../tsconfig.app.json`): `erasableSyntaxOnly`로 enum, namespace, 파라미터 프로퍼티 사용 금지. `verbatimModuleSyntax`로 타입 전용 import는 반드시 `import type`을 쓴다. `noUnusedLocals`/`noUnusedParameters`가 켜져 있다.

## Implementation Patterns

- 컴포넌트는 `components/`에 named export 함수 컴포넌트로 만들고 props 인터페이스를 같은 파일 상단에 둔다.
- 공용 타입은 `types/index.ts`에 둔다.
- 컴포넌트 테스트는 대상 파일 옆에 `*.test.tsx`로 둔다. 쿼리는 `getByRole` 우선, 상호작용은 `userEvent.setup()`을 쓴다 (`components/PromptInput.test.tsx`).

## Testing Strategy

- `bun run test src` 로 프론트엔드 테스트만 실행한다.
- jsdom 환경이며 `test/setup.ts`가 jest-dom 매처를 등록하고 테스트마다 `cleanup()`을 호출한다. 이 파일을 우회하는 개별 setup을 만들지 않는다.

## Local Golden Rules

- 미리보기 새로고침은 `LivePreview`의 `key`를 바꿔 리마운트하는 방식이다 (`components/ComponentCard.tsx:33,70`). 애니메이션 초기화가 목적이므로 `key` 제거나 상태 리셋 방식으로 바꾸지 않는다.
- 재생성은 프롬프트 문자열만 `App`의 `handleGenerate`로 넘긴다 (`ComponentCard.tsx:41`, `App.tsx:113-119`). API 키와 공급자는 `App`이 단일 출처이므로 카드 안에서 따로 보관하지 않는다.
- API 키는 `useState`로만 보관하고 어떤 저장소에도 저장하지 않는다. 생성된 컴포넌트가 `react-live`로 같은 origin에서 실행되어 `localStorage`를 읽을 수 있기 때문이다. API 키 입력은 `type="password"` 기본값이고 공급자를 바꾸면 입력값을 비운다. Provider, 프롬프트 히스토리, 생성된 컴포넌트 목록은 `usePersistentState`로 `localStorage`에 저장한다 (키 이름은 `utils/storage.ts`의 `STORAGE_KEYS`). 저장소 접근은 `utils/storage.ts`를 통해서만 하고, 저장된 값은 `revive` 함수로 검증한다.
- 키 사용 여부는 `/api/config`의 boolean으로만 판단한다 (`App.tsx:105-111`). 서버 키 값을 받아 오는 방식으로 바꾸지 않는다.
- `Provider` 타입이 `types/index.ts:1`과 `server/index.ts:57`에 중복 정의되어 있다. 값을 추가할 때 두 곳을 함께 수정한다.
- 에러는 `useComponentGenerator`의 `error` 상태로 모아 `App`의 배너 한 곳에서 표시한다 (`hooks/useComponentGenerator.ts:63-65`, `App.tsx:197`). 컴포넌트별로 별도 alert을 늘리지 않는다.
- 테스트가 없는 영역은 `App.tsx`, `hooks/useComponentGenerator.ts`, `ComponentCard.tsx`, `CodeView.tsx`, `LivePreview.tsx`다. 이 파일의 동작을 바꾸면 테스트를 함께 추가한다.

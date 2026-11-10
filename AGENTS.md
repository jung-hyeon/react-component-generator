# AGENTS.md

## Operational Commands

- 패키지 매니저는 `bun` 고정. npm/yarn/pnpm 사용 금지 (`bun.lock` 사용).
- 개발 서버(API + Vite 동시): `bun run dev`
- API 서버만: `bun run server` (포트 3002)
- 테스트 전체: `bun run test` (vitest). `bun test`는 Bun 내장 러너를 호출하므로 사용 금지.
- 단일 파일 테스트: `bun run test server/generator.test.ts`
- 린트: `bun run lint` / 타입체크 + 빌드: `bun run build`
- 변경 후 커밋 전 `bun run lint`, `bun run test`, `bun run build`를 모두 통과시킨다.

## Golden Rules

### Immutable

- API 키를 클라이언트 번들, 응답 본문, 로그에 노출하지 않는다. `/api/config`는 키 존재 여부(boolean)만 반환한다 (`server/index.ts:147-156`). 키 값 자체를 반환하도록 바꾸지 않는다.
- Google 호출은 API 키가 URL 쿼리에 들어간다 (`server/index.ts:99`). 이 URL을 로그나 에러 메시지에 포함하지 않는다.
- `.env`는 커밋하지 않는다 (`.gitignore`).

### Hard Constraints

- 미리보기는 react-live `noInline` 모드다 (`src/components/LivePreview.tsx:11`). 생성 코드 끝에 `render(<Component />)` 호출이 없으면 아무것도 그려지지 않는다.
- 생성 코드는 import 문, TypeScript 문법, CSS 파일을 쓸 수 없다. React는 전역 스코프로 주입된다 (`server/index.ts:10-11,20`). 시스템 프롬프트를 수정할 때 이 제약을 유지한다.
- 프록시 포트 3002는 `server/index.ts:139`와 `vite.config.ts:11`에 각각 하드코딩되어 있다. 한쪽만 바꾸지 않는다.

### Double Defense

- `render()` 누락은 두 곳에서 막는다: 시스템 프롬프트 지시(`server/index.ts:12`)와 서버 후처리 `ensureRenderCall`(`server/generator.ts:36`). 둘 중 하나를 제거하지 않는다.

### Asymmetry

- Google 경로에만 모델 폴백(`withModelFallback`)과 `MAX_TOKENS` 잘림 검사가 있다 (`server/index.ts:122-136`). Anthropic 경로(`server/index.ts:68-96`)에는 없다. 공급자 처리를 수정할 때 두 경로의 차이가 의도된 것인지 확인한다.
- 에러 응답 매핑은 에러 메시지 문자열에 `503`/`429`가 포함되는지로 판단한다 (`server/index.ts:194,201`). 새 공급자 호출을 추가하면 에러 메시지에 HTTP 상태 코드를 포함시킨다.

### Test Boundary

- 테스트가 있는 곳: `server/generator.ts`, `server/fallback.ts`, `src/components/PromptInput.tsx`. 이 파일들을 수정하면 해당 테스트를 함께 갱신한다.
- 테스트가 없는 곳: `server/index.ts`(`Bun.serve` 부수효과), `src/App.tsx`, `src/hooks/useComponentGenerator.ts`. 새 로직은 `server/generator.ts`처럼 부수효과 없는 순수 함수로 분리해 테스트 가능하게 만든다.

## Project Context

- 프롬프트로 React 컴포넌트를 생성하고 실시간 미리보기를 제공하는 도구. 소개와 실행 방법은 `README.md` 참고.
- Stack: React 19, TypeScript, Vite, react-live, Bun(API 프록시), vitest, Testing Library.

## Standards and References

- 커밋 메시지: `<type>: <한국어 요약>` (type은 feat, fix, refactor, chore). 요약은 50자 안팎, 마침표 없음.
- 사용자 대면 문자열과 주석은 한국어로 작성한다.
- 규칙과 코드 사이에 괴리가 생기면 이 파일의 업데이트를 제안한다.

## Context Map

- **[서버/API 프록시 수정](./server/AGENTS.md)** — Bun 서버, 공급자 호출, 응답 후처리 작업 시.
- **[프론트엔드 UI 수정](./src/AGENTS.md)** — React 컴포넌트, 훅, 스타일, 프론트 테스트 작업 시.

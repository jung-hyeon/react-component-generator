# server/AGENTS.md

## Module Context

Bun 런타임에서 실행되는 AI 공급자 프록시. 프론트엔드는 Vite 프록시(`/api`)를 통해서만 접근한다. 루트 규칙은 `../AGENTS.md` 참고.

## Tech Stack and Constraints

- Bun 전용 API(`Bun.serve`, `process.env`)는 `server/index.ts`에만 둔다. 다른 파일은 vitest(Node/jsdom)에서 실행되므로 Bun 전역을 참조하면 테스트가 깨진다 (`vite.config.ts`의 `include`에 `server/**/*.test.ts` 포함).
- HTTP 호출은 내장 `fetch`만 사용한다. 공급자 SDK나 axios를 추가하지 않는다.

## Implementation Patterns

- 새 순수 로직은 `generator.ts`/`fallback.ts`처럼 별도 파일로 분리하고 같은 이름의 `.test.ts`를 둔다.
- 새 공급자 추가 시: `Provider` 타입(`index.ts:57`, 프론트엔드 `../src/types/index.ts:1`에 중복 정의됨)과 `ENV_KEYS`(`index.ts:59`)에 함께 등록한다.
- 모든 응답에 `CORS_HEADERS`를 붙인다 (`index.ts:51`). 새 분기에서 누락하지 않는다.

## Testing Strategy

- `bun run test server` 로 서버 테스트만 실행한다.
- 테스트 명명은 한국어 동작 서술(`it('... 한다')`) 형식을 따른다.

## Local Golden Rules

- 모델 폴백 대상 목록은 `GOOGLE_MODELS` 배열 순서가 곧 우선순위다 (`index.ts:5`). 순서를 바꾸면 비용과 응답 품질이 달라진다.
- `withModelFallback`은 모든 모델이 실패하면 마지막 에러만 던진다 (`fallback.ts:19`). 에러 메시지의 상태 코드 매핑(`index.ts:194-206`)이 이 마지막 에러에 의존한다.
- 정규식 기반 후처리(`stripCodeFences`, `ensureRenderCall`)를 고칠 때는 코드펜스 언어 태그 변형과 `render` 호출 유무 케이스를 `generator.test.ts`에 추가한다.

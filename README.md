# 세미투어 플래너

여행사 직원이 세미패키지·풀패키지 상품의 **코스 → 견적 → 고객 문서 → 예약·운영**까지 한 화면에서 만드는 웹앱입니다.
AI(Gemini)로 일정 초안·검증·시세 조사를 하고, 결과는 브라우저 또는 서버(Cloudflare KV)에 저장합니다.

- 프레임워크: Next.js 16 (App Router) · React 19 · Tailwind CSS 4
- 배포: Cloudflare Workers (`vinext`로 빌드) — Vercel이 아닙니다
- 저장소: Cloudflare KV (`PLANS`, `AI_CACHE`), 브라우저 localStorage

> 이 저장소의 Next.js는 학습 자료와 다른 부분이 있습니다. 코드를 고치기 전에 `AGENTS.md`를 먼저 읽으세요.

## 처음 실행하기

```bash
npm ci
npm run hooks:install   # 커밋 전 테스트 + 버전 자동 증가 훅 설치 (한 번만)
cp .env.example .env.local   # 값 채우기 (아래 표)
npm run dev             # http://localhost:3000
```

Node 버전은 `.node-version`(22)을 따릅니다. CI도 같은 버전을 씁니다.

## 주요 명령

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | 개발 서버 (Next) |
| `npm test` | 단위 테스트 (vitest) |
| `npm run test:e2e` | 브라우저 테스트 (Playwright, AI 응답은 가짜) |
| `npm run lint` | 린트 |
| `npm run build` | Next 빌드 확인 |
| `npm run build:vinext` | **실제 배포용** Cloudflare 빌드 |
| `npm run dev:vinext` / `start:vinext` | 배포 환경과 같은 방식으로 로컬 실행 |
| `npm run deploy:vinext` | Cloudflare에 배포 |

CI(`.github/workflows/ci.yml`)는 푸시·PR마다 타입 검사 → 린트 → 테스트 → Next 빌드 → vinext 빌드 → 브라우저 테스트를 돌립니다.

## 환경변수

로컬은 `.env.local`, 배포는 Cloudflare 대시보드의 **변수 및 암호(Secret)** 에 넣습니다. 키·코드는 반드시 Secret으로 넣으세요.

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `GEMINI_API_KEY` | ✅ | AI 기능 전체 |
| `APP_ACCESS_CODE` | 배포 시 ✅ | 관리자 접속 코드. 비우면 잠금이 꺼집니다(로컬 개발 전용). 스튜디오처럼 다른 사이트에서도 확인할 수 있으므로 **영문·숫자 섞어 12자 이상**을 쓰세요(짧으면 관리자 화면에 경고) |
| `APP_WORKSPACE_ID` | 권장 | 서버 저장 공간 ID 고정(영문·숫자 8~64자). 없으면 접속 코드에서 만들어져, 코드를 바꾸면 저장 데이터가 안 보입니다 |
| `GEMINI_MODEL` / `GEMINI_BASE_URL` | 선택 | 모델(기본 `gemini-flash-lite-latest`)·중계 주소 변경 |
| `GROQ_API_KEY` | 권장 | 대체 AI. Gemini가 한도·크레딧 소진이면 Groq가 이어 받음 (모델: `GROQ_MODEL`, `GROQ_SEARCH_MODEL`, `GROQ_VISION_MODEL`) |
| `AI_PROVIDERS` | 선택 | AI 순서 (기본 `gemini,groq,cloudflare`) |
| `CF_AI_MODEL` | 선택 | Cloudflare Workers AI 모델 (기본 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| `STUDIO_ORIGINS` | 권장 | 상세페이지 스튜디오 등 AI 중계를 허용할 사이트(쉼표 구분). 비우면 모든 사이트 허용(코드는 여전히 필요) |
| `GOOGLE_MAPS_API_KEY` | 선택 | 이동 시간(Google Routes)·지도. 없으면 거리로 어림 |
| `KAKAO_REST_API_KEY` | 선택 | 국내 차량 길찾기·통행료 |
| `TRAVELPAYOUTS_TOKEN` | 선택 | 항공 최저가 |
| `VIATOR_API_KEY` | 선택 | 투어 판매가·평점 |
| `DATA_GO_KR_KEY` | 선택 | 여행경보 예비 조회 |

설정 상태는 관리자로 로그인한 뒤 `/api/health`(외부 접속 위치까지 보려면 `/api/health?probe=1`)에서 확인합니다. 로그인하지 않으면 버전만 보입니다.

## Cloudflare 설정 (`wrangler.jsonc`)

- `placement.region = aws:us-east-1` — Gemini 지원 지역에서 실행되도록 고정
- `AI_RATE_LIMITER` — AI 호출 제한 (IP당 1분 10회)
- `AUTH_RATE_LIMITER` — 접근 코드 확인 시도 제한 (로그인·스튜디오 공통, IP당 1분 120회)
- `AUTH_FAIL_LIMITER` — 틀린 접근 코드가 IP당 1분 10회를 넘으면 그 IP를 10분 잠금 (잠금 기록은 KV `authlock:` 키)
- KV `PLANS`(일정·예약·직원·견적 요청 등), `AI_CACHE`(스튜디오 AI 중계 캐시) — id를 비워 두면 배포 때 자동 생성

## AI 자동 전환

서버의 AI 호출(`lib/server/gemini.ts`의 `generateJson`, `generateGroundedText`)은 `AI_PROVIDERS` 순서로 시도합니다.

| 순서 | 업체 | 일반 생성 | 웹 검색 조사 | 코스표 사진 | 코스표 PDF |
| --- | --- | --- | --- | --- | --- |
| 1 | Gemini (무료 키, Flash-Lite) | ✅ | ✅ Google 검색 | ✅ | ✅ |
| 2 | Groq (`GROQ_API_KEY`) | ✅ | 🟡 `groq/compound` 웹 검색 | ✅ | ❌ |
| 3 | Cloudflare Workers AI (`AI` 바인딩) | ✅ | ❌ 검색 없음 → "웹 근거 없음" 표시 | ❌ | ❌ |

- 402(크레딧 소진)·429(한도)·5xx·시간 초과·키 오류면 다음 업체로 넘어갑니다. 실패한 업체는 잠시 쉬게 합니다(크레딧·키 1시간, 한도 5분 또는 안내된 시간, 장애 1분). 쓸 수 있는 업체가 모두 쉬는 중이면 그래도 시도합니다.
- 대체 업체가 답하면 응답에 `X-AI-Provider` 머리글이 붙고, 화면 오른쪽 아래에 "대체 AI가 답했습니다" 안내가 뜹니다.
- 상태는 관리자로 `/api/health`의 `aiProviders`에서 봅니다(쉬는 상태는 서버 인스턴스마다 따로).
- 상세페이지 스튜디오 중계(`/api/studio/gemini`)는 Gemini 형식을 그대로 전달하므로 자동 전환 대상이 아닙니다.

## 로그인과 권한

- **관리자**: `APP_ACCESS_CODE`로 로그인. 직원 계정을 만들고 권한을 줍니다.
- **직원(staff)**: 개인 코드로 로그인. 원가·마진까지 봅니다.
- **영업(sales)**: 원가·마진을 숨기고 판매가만 봅니다.
- 로그인 쿠키는 30일 동안 유효하고, 서버에서도 발급 시각을 확인합니다. 접속 코드를 바꾸면 모든 로그인이 풀립니다.
- 틀린 코드를 1분에 10번 넘게 넣으면 그 IP는 10분 동안 로그인·스튜디오 연결이 모두 막힙니다(맞는 코드도 확인하지 않음). 사무실에서 실수로 잠겼다면 10분 기다리면 풀립니다.

## 공개 페이지 (로그인 없이 링크로 여는 화면)

| 주소 | 용도 |
| --- | --- |
| `/q` | 고객 견적 요청 폼 (홈페이지·SNS에 링크) |
| `/t/[id]` | 고객용 웹 일정표 (예약 요청 가능) |
| `/g/[id]` | 가이드 운영 페이지 (진행 체크·현장 기록) |
| `/r/[id]` | 고객 만족도 조사 |
| `/gb?city=` | 도시별 가이드 교육 자료 인쇄 (직원만) |

## 폴더 구조

```
app/            화면(page)과 API(app/api/**/route.ts)
components/     화면 조각 — PlannerApp.tsx가 메인 화면
hooks/          화면 상태·서버 호출 훅
lib/            계산·규칙 (화면과 무관한 순수 로직), lib/server/는 서버 전용
lib/schemas/    AI 응답·요청 검증(zod)
tests/          단위 테스트, e2e/ 브라우저 테스트
```

## 데이터 백업

- 브라우저 데이터: 상단 **더보기 메뉴 → 이력·백업**에서 파일로 내려받고 되살립니다.
  되살리다가 저장 공간이 부족하면 원래 데이터로 되돌립니다.
- 서버 데이터(KV): Cloudflare 대시보드 또는 `wrangler kv` 명령으로 내보냅니다.

## 버전

`lib/version.ts`의 `APP_VERSION`(`YYYY.MM.DD-N`)은 pre-commit 훅이 커밋마다 자동으로 올립니다. 직접 고치지 마세요.

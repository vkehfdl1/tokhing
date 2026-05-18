# AGENTS.md — ToKHin' LMSR Prediction Market

## Project Overview

KBO 야구 승부예측 앱(ToKHin')을 LMSR 기반 예측시장으로 전환하는 프로젝트.
기존 "팀 하나 찍기 + 점수제"를 "HOME/AWAY/DRAW 토큰 매수/매도 + 만기 0/100 정산" 시스템으로 완전 대체한다.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 3.4 + shadcn/ui (Radix) + Pretendard 폰트
- **Database**: Supabase (PostgreSQL) — 테이블, RPC 함수, RLS, pg_cron
- **Auth**: 자체 구현 (학번 + SHA-256 해시 비밀번호, Supabase Auth 미사용)
- **Deploy**: Vercel
- **Package Manager**: npm

## Key Files

| Path | Description |
|------|-------------|
| `app/page.tsx` | 메인 페이지 (마켓 목록으로 교체 예정) |
| `app/layout.tsx` | 루트 레이아웃 |
| `app/admin/page.tsx` | 관리자 페이지 |
| `app/history/page.tsx` | 히스토리 (포지션/거래내역으로 교체 예정) |
| `app/leaderboard/page.tsx` | 리더보드 |
| `app/tutorial/page.tsx` | 튜토리얼 |
| `lib/api.ts` | Supabase API 함수 모음 (~590줄) |
| `lib/supabase/client.ts` | 브라우저 Supabase 클라이언트 |
| `lib/supabase/server.ts` | 서버 Supabase 클라이언트 |
| `components/navigation.tsx` | 반응형 네비게이션 (하단 모바일 / 상단 데스크톱) |
| `components/ui/*` | shadcn/ui 컴포넌트 (Button, Card, Input 등) |
| `tailwind.config.ts` | Tailwind 설정 (KBO 팀 컬러, tokhin-green 등) |
| `prd.md` | **필독** — 디자인 철학, 디자인 토큰, 와이어프레임 W-01~W-08 |
| `prd.json` | 스토리별 상태 추적 파일 |

## Design Constraints (반드시 준수)

1. **Mobile-Only Layout**: 전체 앱 `max-width: 430px` 고정. PC에서도 중앙 정렬, 외부 배경 `#111111`.
2. **Design Tokens**: `prd.md`의 "디자인 토큰" 섹션 참조. 카드는 `rounded-2xl` + 커스텀 shadow, 버튼은 `rounded-lg h-12`.
3. **Color Semantics**: tokhin-green `#32C600` (브랜드), 매수=`bg-green-500`, 매도=`bg-red-500`, 가격상승=초록, 하락=빨강.
4. **Bottom Nav**: `fixed bottom-0`, `bg-white/80 backdrop-blur`, `rounded-tl-[40px] rounded-tr-[40px]`. 페이지 하단에 `pb-28` 여유.
5. **Typography**: Pretendard. Bold(700) 헤딩, Semibold(600) 서브, Normal(400) 본문, Light(300) 보조.
6. **Team Colors**: `tailwind.config.ts`에 정의된 KBO 10개 팀 컬러 사용.

## Database (Supabase)

### 기존 테이블
- `users` — id(UUID), student_number(BIGINT), username, phone_number, department, favorite_team_id
- `games` — id, game_date, game_time, home_team_id, away_team_id, home/away_pitcher, home/away_score, game_status
- `teams` — id, name, short_name (KBO 10개팀)
- `predictions` — 기존 예측 (삭제하지 않고 유지, 새 코드에서 미참조)

### 신규 테이블 (US-001, US-002에서 생성)
- `wallets` — user_id(UNIQUE), balance(NUMERIC, CHECK >= 0)
- `settings` — key(UNIQUE), value(JSONB) — liquidity_b 등
- `markets` — game_id(UNIQUE), q_home/q_away/q_draw, b, status, result
- `orders` — user_id, market_id, outcome, side(BUY/SELL), quantity, total_cost, avg_price
- `positions` — user_id, market_id, outcome, quantity, avg_entry_price (UNIQUE on user+market+outcome)
- `transactions` — user_id, type, amount, balance_after, reference_id

### Supabase 접근
- Project: `tolking` (Reference ID: `wajecvhfldtxdwkfbiaj`, Region: Seoul)
- CLI: `supabase` 설치됨 (`/opt/homebrew/bin/supabase`), `supabase link` 필요할 수 있음
- SQL 실행: `supabase db execute` 또는 Supabase SQL Editor
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (.env.local)

## LMSR Core Logic

비용함수: `C(q) = b * ln(exp(q_home/b) + exp(q_away/b) + exp(q_draw/b))`
- 오버플로우 방지: max-shift 기법 (모든 q에서 max(q)를 빼서 계산)
- 가격: `p_i = 100 * exp(q_i/b) / Σexp(q_j/b)` (합=100)
- 매수 비용: `100 * (C_after - C_before)`
- 매도 환급: `100 * (C_before - C_after)`
- 정산: 정답 토큰 1주 = 100코인, 오답 = 0코인

## Auth System

- ID: 학번 (student_number)
- PW: 초기값 = phone_number의 SHA-256 해시
- 최초 로그인 시 비밀번호 변경 강제 (password_changed 플래그)
- 세션: localStorage에 {user_id, username, student_number} 저장
- Supabase Auth 미사용

## Conventions

- 모든 RPC 함수는 PostgreSQL `CREATE OR REPLACE FUNCTION`으로 작성
- 거래 관련 함수는 반드시 단일 트랜잭션 내에서 atomic 처리
- 프론트 컴포넌트는 `'use client'` 지시어 사용 (Next.js App Router)
- API 함수는 `lib/api.ts`에 집중
- 새 페이지는 `app/` 디렉토리 내 폴더 기반 라우팅
- 에러 메시지는 한국어

## Season System (US-012)

ToKHin' 은 시즌 단위로 코인이 격리된다. 각 시즌은 독립된 잔고/거래/포지션을 갖고, 시즌이 바뀌면 이전 시즌은 보관(ARCHIVED) 상태로 잠긴다.

### Tables
- `seasons(id, name, start_date, end_date, status)` — `status IN ('DRAFT','ACTIVE','ARCHIVED')`
  - partial unique index: ACTIVE 1개, DRAFT 1개만 허용
- `wallets`, `markets`, `orders`, `positions`, `transactions` — 전부 `season_id NOT NULL` FK 추가
- `wallets` UNIQUE 제약: `(user_id, season_id)` → 사용자당 시즌별 지갑 1개

### Initial seeded seasons
- Season 0 (id=0, ARCHIVED): ~2026-03-27 — 레거시 데이터 버킷
- Season 1 (id=1, ACTIVE): 2026-03-28 ~ — 현재 활성
- Season 2 (id=2, DRAFT): 2026-05-19 ~ 2026-06-21 — 관리자가 수동 활성화 대기

### Lifecycle (admin-controlled)
1. **CREATE** → `create_season(name, start, end)` 으로 DRAFT 생성 (DRAFT 동시 1개만)
2. **ACTIVATE** → `activate_season(id)` 호출. 이전 ACTIVE 시즌에 미정산(OPEN/CLOSED) 마켓이 있으면 차단. 성공 시: 이전 시즌 ARCHIVED + 새 시즌 ACTIVE + 전 사용자에게 1000코인 SEASON_GRANT 발행
3. **END** → `end_season(id)` 로 명시적 종료 (활성→보관). 다음 시즌 activate 시 자동 종료도 가능

### Rules
- 모든 거래/정산은 active 시즌에서만 가능. 마켓의 `season_id`가 active와 다르면 RPC가 `'이 시즌은 더 이상 거래할 수 없습니다'` 로 차단
- 신규 마켓 생성 시 자동으로 active 시즌의 id 부여 (`create_market` 내부에서 lookup)
- 신규 회원가입 시 active 시즌의 지갑 자동 생성 (1000코인 + SEASON_GRANT 트랜잭션)
- 리더보드/히스토리는 시즌별 조회 가능. 메인 페이지는 active 시즌 마켓만 노출
- 마켓 상세에서 archived 시즌 마켓은 read-only (포지션은 표시, 거래 UI는 banner로 대체)

### Transaction types
`BUY, SELL, SETTLEMENT, WEEKLY_GRANT, ADMIN_GRANT, SEASON_GRANT` — SEASON_GRANT는 시즌 시작 시 일괄 지급

### Migrations
- `20260518000000_us_seasons_schema.sql` — 테이블, 컬럼, 백필, UNIQUE swap, SEASON_GRANT 합성
- `20260518000001_us_seasons_rpcs.sql` — 시즌 라이프사이클 RPC 5개 + 기존 RPC 17개 시즌-인식 업데이트

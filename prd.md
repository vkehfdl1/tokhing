# PRD

## Project
- Name: LMSR Prediction Market (Stock-Market Style)
- Branch: Feature/stock-market
- Description: 기존 승부예측(팀 선택 + 점수제)을 LMSR 기반 예측시장으로 완전 전환. 유저가 HOME/AWAY/DRAW 토큰을 매수/매도하여 경기 결과에 베팅하고, 만기 시 정답 토큰은 100코인, 오답 토큰은 0코인으로 정산되는 시스템. Supabase DB + RPC 기반으로 LMSR 엔진을 구현하고, 모바일 퍼스트 UI로 거래 인터페이스를 제공한다.

---

## Design Philosophy (디자인 철학)

현재 ToKHin' 앱에서 추출한 핵심 디자인 원칙. 모든 새 화면은 이 원칙을 따른다.

### 핵심 원칙
1. **Functional Minimalism** — 장식보다 정보 전달 우선. 모든 시각 요소는 목적이 있어야 함.
2. **Sports-Forward Identity** — KBO 팀 컬러를 적극 활용하여 팀 정체성을 존중.
3. **Mobile-Only Fixed Layout** — PC에서도 max-width 430px 모바일 프레임 고정. 중앙 정렬, 어두운 배경.
4. **Touch-First Interaction** — 최소 터치 타겟 48px(h-12), 충분한 gap(12px+), 하단 네비게이션.
5. **Information Hierarchy via Typography** — Bold(700) 헤딩, Semibold(600) 서브헤딩, Normal(400) 본문, Light(300) 보조 정보.
6. **Color as Semantics** — 색상은 의미를 전달: 초록=#32C600(브랜드/성공), 빨강(위험/하락), 팀컬러(정체성), 회색(비활성).

### 디자인 토큰
- **Primary**: tokhin-green `#32C600`
- **Background**: `#FFFFFF` (앱 내부), `#111111` (PC 바깥 배경)
- **Text**: `#0A0A0A` (기본), `text-gray-600` (보조), `text-zinc-500` (메타)
- **Font**: Pretendard Variable (100-900)
- **Card**: `rounded-2xl`, `shadow-[0px_2px_12px_0px_rgba(0,0,0,0.12)]`, `p-5`
- **Button**: `rounded-lg`, `h-12`, `shadow-[0px_0px_8px_0px_rgba(0,0,0,0.12)]`
- **Bottom Nav**: `fixed bottom-0`, `bg-white/80 backdrop-blur`, `rounded-tl-[40px] rounded-tr-[40px]`, `h-24`
- **Spacing**: `p-4` 모바일 기본, `space-y-6` 섹션 간격, `pb-28` 하단 nav 여유

### 금융 UI 추가 토큰
- **가격 상승**: `text-green-500` or `text-tokhin-green`
- **가격 하락**: `text-red-500`
- **가격 보합**: `text-gray-500`
- **매수 버튼**: `bg-green-500 text-white`
- **매도 버튼**: `bg-red-500 text-white`
- **코인 아이콘/표시**: tokhin-green 계열, `font-bold`

---

## Wireframes (와이어프레임)

모든 화면은 **430px 고정 너비** 모바일 프레임 기준.

### W-01: 로그인 화면
```
┌─────────────────────────────┐
│                             │
│         [ToKHin' Logo]      │
│        승부예측 마켓          │
│                             │
│  ┌───────────────────────┐  │
│  │ 학번 입력               │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ 비밀번호 입력 (●●●●●)   │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │      로 그 인           │  │
│  └───────────────────────┘  │
│                             │
│                             │
│                             │
└─────────────────────────────┘
```

### W-02: 최초 로그인 — 비밀번호 변경
```
┌─────────────────────────────┐
│                             │
│       비밀번호 변경           │
│  최초 로그인입니다.            │
│  새 비밀번호를 설정해주세요.    │
│                             │
│  ┌───────────────────────┐  │
│  │ 새 비밀번호              │  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ 비밀번호 확인            │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │      변경 완료           │  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘
```

### W-03: 메인 화면 — 마켓 목록
```
┌─────────────────────────────┐
│  ToKHin'        🪙 3,250    │
│─────────────────────────────│
│  2025.10.15 (수) 오늘의 마켓  │
│                             │
│  ┌───────────────────────┐  │
│  │ KIA vs 삼성    18:30    │  │
│  │ ─────────────────────  │  │
│  │ HOME   AWAY   DRAW    │  │
│  │ 47.5   47.5    5.0    │  │
│  │         [OPEN]         │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ LG vs 두산     18:30    │  │
│  │ ─────────────────────  │  │
│  │ HOME   AWAY   DRAW    │  │
│  │ 52.3   43.2    4.5    │  │
│  │         [OPEN]         │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ NC vs 롯데     18:30    │  │
│  │ ─────────────────────  │  │
│  │ HOME   AWAY   DRAW    │  │
│  │ 61.0   34.5    4.5    │  │
│  │        [SETTLED]       │  │
│  └───────────────────────┘  │
│                             │
│  pb-28 (nav 여유)            │
│┌───────────────────────────┐│
││  🏠     📊     🏆     ❓  ││
││ 마켓   포지션  리더보드 도움말 ││
│└───────────────────────────┘│
└─────────────────────────────┘
```

### W-04: 마켓 상세 & 거래 화면
```
┌─────────────────────────────┐
│  ← KIA vs 삼성               │
│                             │
│  ┌───────────────────────┐  │
│  │   KIA 타이거즈  vs  삼성  │  │
│  │   18:30  ·  OPEN       │  │
│  │                        │  │
│  │  HOME    AWAY    DRAW  │  │
│  │  47.5    47.5    5.0   │  │
│  │  (큰 숫자, 팀 컬러)      │  │
│  └───────────────────────┘  │
│                             │
│  ── 내 포지션 ──             │
│  HOME: 15주 (평가 712코인)   │
│  AWAY: -     DRAW: -        │
│                             │
│  ┌───────────────────────┐  │
│  │  [매수 BUY] | [매도 SELL]│  │
│  │─────────────────────── │  │
│  │  ○HOME  ○AWAY  ○DRAW   │  │
│  │                        │  │
│  │  [수량(주)] | [금액(코인)]│  │
│  │  ┌─────────────────┐   │  │
│  │  │ 10              │   │  │
│  │  └─────────────────┘   │  │
│  │                        │  │
│  │  예상 비용: 487 코인     │  │
│  │  평균 단가: 48.7         │  │
│  │  잔고: 3,250 → 2,763    │  │
│  │                        │  │
│  │  ┌─────────────────┐   │  │
│  │  │    주문하기       │   │  │
│  │  └─────────────────┘   │  │
│  └───────────────────────┘  │
│                             │
│┌───────────────────────────┐│
││ 🏠    📊     🏆     ❓   ││
│└───────────────────────────┘│
└─────────────────────────────┘
```

### W-05: 주문 확인 모달
```
┌─────────────────────────────┐
│  ┌───────────────────────┐  │
│  │                       │  │
│  │    주문 확인            │  │
│  │                       │  │
│  │  KIA vs 삼성           │  │
│  │  HOME 매수             │  │
│  │                       │  │
│  │  수량     10주          │  │
│  │  예상비용  487 코인      │  │
│  │  평균단가  48.7         │  │
│  │                       │  │
│  │  ┌──────┐ ┌──────┐    │  │
│  │  │ 취소  │ │ 확인  │    │  │
│  │  └──────┘ └──────┘    │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

### W-06: 포지션 / 히스토리 화면
```
┌─────────────────────────────┐
│  포지션              🪙 3,250│
│─────────────────────────────│
│ [진행중] [거래내역] [정산내역] │
│─────────────────────────────│
│                             │
│  ┌───────────────────────┐  │
│  │ KIA vs 삼성  10/15     │  │
│  │ HOME 15주              │  │
│  │ 평균 48.7  현재 52.3    │  │
│  │ 미실현 손익: +54 코인 ▲  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ LG vs 두산   10/15     │  │
│  │ AWAY 8주               │  │
│  │ 평균 43.2  현재 40.1    │  │
│  │ 미실현 손익: -25 코인 ▼  │  │
│  └───────────────────────┘  │
│                             │
│┌───────────────────────────┐│
││ 🏠    📊     🏆     ❓   ││
│└───────────────────────────┘│
└─────────────────────────────┘
```

### W-07: 리더보드
```
┌─────────────────────────────┐
│  리더보드                    │
│─────────────────────────────│
│  [잔고 순위] [수익률 순위]    │
│─────────────────────────────│
│                             │
│  ┌───────────────────────┐  │
│  │ 🥇 1  김철수   5,230   │  │ ← bg-tokhin-green
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │    2  박영희   4,890   │  │ ← text-tokhin-green
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │    3  이민수   4,120   │  │ ← text-tokhin-green
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │    4  최지은   3,850   │  │ ← text-gray
│  └───────────────────────┘  │
│  ...                        │
│                             │
│┌───────────────────────────┐│
││ 🏠    📊     🏆     ❓   ││
│└───────────────────────────┘│
└─────────────────────────────┘
```

### W-08: Admin — 마켓 관리 + 설정
```
┌─────────────────────────────┐
│  Admin Panel                │
│─────────────────────────────│
│  [경기관리] [정산] [설정]     │
│─────────────────────────────│
│                             │
│  ── 전역 설정 ──             │
│  유동성 (b값): [  10  ] 저장  │
│                             │
│  ── 코인 지급 ──             │
│  전체 지급: [1000] [지급하기]  │
│  개별 지급: [학번] [금액] [지급]│
│  마지막 자동 지급: 10/14 00:00│
│                             │
│  ── 마켓 정산 ──             │
│  KIA vs 삼성 (10/15)         │
│  결과: ○HOME ○AWAY ○DRAW    │
│  [정산 실행]                  │
│                             │
└─────────────────────────────┘
```

---

## User Stories

### US-001
- Title: 인증 시스템 — 학번 로그인 + 비밀번호 (Supabase 직접 구현)
- Priority: 1
- Description: 학번을 ID로, 전화번호를 초기 비밀번호로 사용하는 간단한 인증 시스템을 구현한다. Supabase Auth는 사용하지 않고, users 테이블에 password_hash 컬럼을 추가하여 직접 관리한다. 최초 로그인 시 비밀번호 변경을 강제한다. 로그인하지 않으면 모든 화면에 접근 불가.
- Acceptance Criteria:
  - REQ-001 `users` 테이블에 `password_hash (TEXT)` 컬럼 추가. 초기값은 해당 유저의 `phone_number`를 SHA-256 해시한 값.
  - REQ-002 `users` 테이블에 `password_changed (BOOLEAN DEFAULT FALSE)` 컬럼 추가. 최초 로그인 후 비밀번호 변경 시 TRUE로 설정.
  - REQ-003 `login(p_student_number BIGINT, p_password TEXT) RETURNS JSONB` RPC 함수 구현. (1) student_number로 유저 조회, (2) SHA-256(p_password)와 password_hash 비교, (3) 일치 시 `{success: true, user_id, username, password_changed}` 반환, 불일치 시 `{success: false, error: "학번 또는 비밀번호가 올바르지 않습니다"}` 반환.
  - REQ-004 `change_password(p_user_id UUID, p_new_password TEXT) RETURNS JSONB` RPC 함수 구현. SHA-256(p_new_password)를 password_hash에 저장, password_changed를 TRUE로 설정.
  - REQ-005 로그인 화면 (W-01): 학번 + 비밀번호 입력 → 로그인 버튼. 기존 ToKHin' 디자인 톤 유지 (tokhin-green 버튼, rounded-2xl 카드, 중앙 정렬).
  - REQ-006 최초 로그인 시 (password_changed === false): 비밀번호 변경 화면 (W-02) 강제 표시. 새 비밀번호 + 확인 입력. 변경 완료 후 메인으로 이동.
  - REQ-007 로그인 상태는 클라이언트 측에서 localStorage 또는 sessionStorage로 관리. `{user_id, username, student_number}` 저장. 로그아웃 시 삭제.
  - REQ-008 모든 페이지 (메인, 히스토리, 리더보드, 튜토리얼)에서 로그인 여부 확인. 미로그인 시 로그인 화면으로 리다이렉트. Admin은 기존 비밀번호 방식 유지.
  - REQ-009 로그아웃 버튼: 하단 네비게이션 또는 프로필 영역에 배치. 터치 시 세션 삭제 후 로그인 화면으로 이동.

### US-002
- Title: DB 스키마 마이그레이션 — 새 테이블 생성 및 기존 테이블 정리
- Priority: 2
- Description: LMSR 예측시장에 필요한 새로운 DB 테이블을 생성하고 기존 `predictions` 테이블 사용을 중단한다. Supabase SQL Editor 또는 migration 파일을 통해 실행한다.
- Acceptance Criteria:
  - REQ-010 `wallets` 테이블 생성: `id (UUID PK)`, `user_id (FK → users.id, UNIQUE)`, `balance (NUMERIC DEFAULT 0)`, `created_at`, `updated_at`. balance는 0 이상이어야 함 (CHECK constraint).
  - REQ-011 `settings` 테이블 생성: `id (SERIAL PK)`, `key (VARCHAR UNIQUE)`, `value (JSONB)`, `updated_at`. 초기 데이터로 `liquidity_b` 키에 기본값 `{"value": 10}` 삽입.
  - REQ-012 `markets` 테이블 생성: `id (SERIAL PK)`, `game_id (FK → games.id, UNIQUE)`, `q_home (NUMERIC DEFAULT 0)`, `q_away (NUMERIC DEFAULT 0)`, `q_draw (NUMERIC DEFAULT 0)`, `b (NUMERIC NOT NULL)`, `status (VARCHAR DEFAULT 'OPEN')`, `result (VARCHAR NULLABLE)` — result는 'HOME'/'AWAY'/'DRAW' 중 하나, `initial_home_price (NUMERIC)`, `initial_away_price (NUMERIC)`, `initial_draw_price (NUMERIC)`, `created_at`, `updated_at`.
  - REQ-013 `orders` 테이블 생성: `id (SERIAL PK)`, `user_id (FK → users.id)`, `market_id (FK → markets.id)`, `outcome (VARCHAR NOT NULL)` — 'HOME'/'AWAY'/'DRAW', `side (VARCHAR NOT NULL)` — 'BUY'/'SELL', `quantity (NUMERIC NOT NULL)`, `total_cost (NUMERIC NOT NULL)`, `avg_price (NUMERIC NOT NULL)`, `created_at`.
  - REQ-014 `positions` 테이블 생성: `id (SERIAL PK)`, `user_id (FK → users.id)`, `market_id (FK → markets.id)`, `outcome (VARCHAR NOT NULL)`, `quantity (NUMERIC DEFAULT 0)`, `avg_entry_price (NUMERIC DEFAULT 0)`, `updated_at`. UNIQUE constraint on (user_id, market_id, outcome).
  - REQ-015 `transactions` 테이블 생성: `id (SERIAL PK)`, `user_id (FK → users.id)`, `type (VARCHAR NOT NULL)` — 'BUY'/'SELL'/'SETTLEMENT'/'WEEKLY_GRANT'/'ADMIN_GRANT', `amount (NUMERIC NOT NULL)`, `balance_after (NUMERIC NOT NULL)`, `reference_id (INTEGER NULLABLE)` — order_id 또는 market_id 참조, `description (TEXT)`, `created_at`.
  - REQ-016 `predictions` 테이블은 삭제하지 않고 그대로 둔다 (기존 히스토리 보존). 새로운 코드에서는 참조하지 않는다.
  - REQ-017 모든 새 테이블에 적절한 RLS (Row Level Security) 정책 설정. wallets/positions/orders/transactions는 본인 데이터만 읽기 가능. markets/settings는 전체 읽기 가능.
  - REQ-018 필요한 인덱스 생성: `orders(user_id, market_id)`, `positions(user_id, market_id)`, `transactions(user_id, created_at)`, `markets(game_id)`.

### US-003
- Title: LMSR 엔진 — Supabase RPC 함수 구현
- Priority: 3
- Description: LMSR 비용함수, 가격 계산, 주문 체결, 정산 로직을 Supabase PostgreSQL 함수(RPC)로 구현한다. 모든 거래는 DB 트랜잭션 내에서 atomic하게 처리한다.
- Acceptance Criteria:
  - REQ-019 `lmsr_cost(q_home NUMERIC, q_away NUMERIC, q_draw NUMERIC, b NUMERIC) RETURNS NUMERIC` 함수 구현. `C = b * ln(exp(q_home/b) + exp(q_away/b) + exp(q_draw/b))` 공식 사용. 수치 오버플로우 방지를 위해 max-shift 기법 적용 (모든 q에서 max(q)를 빼서 계산).
  - REQ-020 `lmsr_prices(market_id INTEGER) RETURNS TABLE(outcome TEXT, price NUMERIC)` 함수 구현. softmax 공식으로 각 결과의 현재 가격(0~100 범위) 반환. 3개 가격의 합은 항상 100.
  - REQ-021 `execute_buy_order(p_user_id UUID, p_market_id INTEGER, p_outcome TEXT, p_quantity NUMERIC) RETURNS JSONB` 함수 구현. (1) 마켓 OPEN 상태 확인, (2) LMSR 비용 계산 (cost = 100 * (C_after - C_before)), (3) 유저 잔고 확인 및 차감, (4) q값 업데이트, (5) position 업데이트 (upsert), (6) order 기록, (7) transaction 기록. 실패 시 전체 롤백. 반환값: `{success, order_id, quantity, total_cost, avg_price, new_balance}`.
  - REQ-022 `execute_sell_order(p_user_id UUID, p_market_id INTEGER, p_outcome TEXT, p_quantity NUMERIC) RETURNS JSONB` 함수 구현. 매수와 역방향. (1) 마켓 OPEN 상태 확인, (2) 유저 포지션 >= 매도수량 확인, (3) 환급금 계산 (refund = 100 * (C_before - C_after)), (4) q값 감소, (5) position 감소, (6) 유저 잔고 증가, (7) order/transaction 기록. 반환값: `{success, order_id, quantity, total_refund, avg_price, new_balance}`.
  - REQ-023 `execute_buy_by_amount(p_user_id UUID, p_market_id INTEGER, p_outcome TEXT, p_amount NUMERIC) RETURNS JSONB` 함수 구현. 코인 금액을 입력하면 해당 금액으로 살 수 있는 수량을 이진 탐색(binary search)으로 계산하여 execute_buy_order를 호출.
  - REQ-024 `settle_market(p_market_id INTEGER, p_result TEXT) RETURNS JSONB` 함수 구현. (1) 마켓 상태를 'SETTLED'로 변경, (2) result 저장, (3) 해당 마켓의 모든 positions 조회, (4) 정답 outcome 보유자에게 quantity * 100 코인 지급, (5) 모든 positions를 0으로 초기화, (6) 각 유저에게 SETTLEMENT 타입 transaction 기록. 반환값: `{success, total_users_settled, total_coins_distributed}`.
  - REQ-025 `create_market(p_game_id INTEGER, p_initial_home NUMERIC DEFAULT 47.5, p_initial_away NUMERIC DEFAULT 47.5, p_initial_draw NUMERIC DEFAULT 5.0) RETURNS INTEGER` 함수 구현. 초기 확률을 기반으로 q값을 계산하여 마켓 생성. `q_i = b * ln(p_i)` 공식 사용. settings에서 b값 조회.
  - REQ-026 `get_market_detail(p_market_id INTEGER) RETURNS JSONB` 함수 구현. 마켓 정보 + 현재 가격 + 관련 game 정보를 한 번에 반환.

### US-004
- Title: 지갑(Wallet) 시스템 — 코인 잔고 및 주간 자동 지급
- Priority: 4
- Description: 유저별 코인 지갑을 관리하고, 매주 자동으로 코인을 지급하는 시스템을 구현한다.
- Acceptance Criteria:
  - REQ-027 유저가 처음 로그인할 때 wallet이 없으면 자동 생성 (balance = 0).
  - REQ-028 `distribute_weekly_coins(p_amount NUMERIC DEFAULT 1000) RETURNS JSONB` RPC 함수 구현. 모든 유저에게 p_amount 코인 지급 + transaction 기록. 반환값: `{success, users_count, total_distributed}`.
  - REQ-029 Supabase pg_cron 확장을 사용하여 매주 월요일 00:00 KST에 `distribute_weekly_coins()` 자동 실행. 또는 pg_cron이 불가능할 경우 Admin에서 수동 트리거 버튼 제공.
  - REQ-030 Admin 페이지에서 특정 유저 또는 전체 유저에게 코인을 수동 지급하는 기능. `admin_grant_coins(p_user_id UUID, p_amount NUMERIC)` RPC 함수.
  - REQ-031 프론트엔드 상단 (헤더 영역)에 현재 코인 잔고를 항상 표시. 코인 아이콘 + 숫자 (예: 🪙 3,250).

### US-005
- Title: 메인 화면 — 마켓 카드 목록 UI
- Priority: 5
- Description: 기존 경기 카드(팀 선택 UI)를 LMSR 마켓 카드로 교체한다. 각 마켓 카드에 실시간 가격이 표시되고, 터치하면 거래 화면으로 이동한다. 와이어프레임 W-03 참조.
- Acceptance Criteria:
  - REQ-032 메인 화면에 오늘 경기 마켓 목록을 표시. 각 카드에는: 홈팀/원정팀 이름, 경기시간, HOME/AWAY/DRAW 현재 가격 (0~100), 마켓 상태 (OPEN/CLOSED/SETTLED). 디자인은 W-03 와이어프레임 따름.
  - REQ-033 가격 표시는 소수점 1자리까지 (예: 47.5). 가격 색상은 디자인 토큰의 금융 UI 색상 따름 (상승=초록, 하락=빨강).
  - REQ-034 경기 상태에 따른 마켓 카드 표시: SCHEDULED → OPEN (거래 가능), IN_PROGRESS → OPEN (거래 가능), FINISHED → CLOSED (거래 불가, 결과 대기), CANCELED → CANCELED.
  - REQ-035 마켓 카드 터치 시 `/market/[id]` 페이지로 이동 (마켓 상세/거래 화면).
  - REQ-036 PC에서도 430px 모바일 크기로 중앙 고정. 외부 배경 `#111111`.
  - REQ-037 모든 경기가 종료된 경우 내일 경기 마켓을 표시 (기존 로직과 동일한 패턴).
  - REQ-038 상단 헤더: 좌측 "ToKHin'" 로고, 우측 코인 잔고 표시.

### US-006
- Title: 마켓 상세 & 거래 화면 — 매수/매도 인터페이스
- Priority: 6
- Description: 개별 마켓의 상세 정보와 매수/매도 주문 인터페이스를 제공하는 화면을 구현한다. 와이어프레임 W-04, W-05 참조.
- Acceptance Criteria:
  - REQ-039 마켓 상세 화면 (`/market/[id]`) 상단: 홈팀 vs 원정팀, 경기시간, 마켓 상태, 현재 가격 3개 (HOME/AWAY/DRAW) 큰 글씨로 표시. 팀 컬러 활용.
  - REQ-040 내 포지션 섹션: 해당 마켓에서 내가 보유한 HOME/AWAY/DRAW 토큰 수량 + 현재 평가금액 (수량 × 현재가) 표시. 포지션이 없으면 "보유 포지션 없음" 표시.
  - REQ-041 주문 패널: 탭으로 "매수(BUY)" / "매도(SELL)" 전환. 매수 탭: bg-green-500, 매도 탭: bg-red-500. 선택한 탭에 따라 주문 패널 색상 톤 변경.
  - REQ-042 매수 탭에서는 HOME/AWAY/DRAW 중 하나 선택 (라디오 버튼) + 수량 또는 투자금액 입력. 입력 모드 토글: "수량(주)" ↔ "금액(코인)".
  - REQ-043 수량 입력 시 예상 비용(슬리피지 포함) 실시간 표시. 금액 입력 시 예상 수량 실시간 표시. "잔고 부족" 또는 "보유수량 부족" 시 주문 버튼 비활성화 + 빨간 경고 텍스트.
  - REQ-044 주문 확인 모달 (W-05): 경기 정보, outcome, 매수/매도, 수량, 예상비용/환급금, 평균단가 요약 표시 후 최종 확인.
  - REQ-045 주문 체결 후: 성공 토스트 메시지 + 가격/포지션/잔고 즉시 업데이트.
  - REQ-046 매도 탭에서는 해당 outcome의 보유 수량까지만 매도 가능. 매도 시 예상 환급금(슬리피지 포함) 실시간 표시.
  - REQ-047 마켓이 CLOSED/SETTLED 상태이면 주문 패널 비활성화. "거래 마감" 메시지 표시.

### US-007
- Title: 거래 히스토리 & 포지션 관리 화면
- Priority: 7
- Description: 기존 예측 히스토리 화면을 거래 내역 + 포지션 관리 화면으로 교체한다. 와이어프레임 W-06 참조.
- Acceptance Criteria:
  - REQ-048 히스토리 탭 구성: "진행 중 포지션" / "거래 내역" / "정산 내역" 탭. 탭 UI는 기존 디자인 톤 (underline 활성 표시).
  - REQ-049 "진행 중 포지션" 탭: 현재 보유 중인 모든 마켓의 포지션 목록. 각 항목: 경기 정보, outcome, 보유수량, 평균매수가, 현재가, 미실현 손익 (현재가 - 평균매수가) × 수량. 손익 양수=초록▲, 음수=빨강▼.
  - REQ-050 "거래 내역" 탭: 최근 주문 목록 (날짜별 그룹핑). 각 항목: 날짜/시간, 경기 정보, BUY(초록)/SELL(빨강), outcome, 수량, 체결금액.
  - REQ-051 "정산 내역" 탭: 정산 완료된 마켓별 손익. 각 항목: 경기 정보, 보유했던 포지션, 정산금액, 최종 손익.
  - REQ-052 기존 캘린더 기반 날짜 네비게이션 UI 유지 (거래내역 필터링용).

### US-008
- Title: 리더보드 — 코인 잔고 + 수익률 복합 랭킹
- Priority: 8
- Description: 리더보드를 코인 잔고 순위와 수익률 순위 두 가지 탭으로 제공한다. 와이어프레임 W-07 참조.
- Acceptance Criteria:
  - REQ-053 `get_leaderboard_balance() RETURNS TABLE(...)` RPC 함수. 코인 잔고 기준 내림차순 정렬. 반환: rank, user_id, username, balance.
  - REQ-054 `get_leaderboard_roi() RETURNS TABLE(...)` RPC 함수. 수익률 = (현재잔고 - 누적지급코인) / 누적지급코인 × 100. 반환: rank, user_id, username, roi_percent, current_balance, total_granted.
  - REQ-055 리더보드 UI에 "잔고 순위" / "수익률 순위" 탭 전환.
  - REQ-056 기존 리더보드 스타일 유지: 1등 tokhin-green 배경 + 흰 텍스트, 2~3등 tokhin-green 텍스트, 나머지 회색.

### US-009
- Title: Admin 패널 — 마켓 관리, 정산, 설정
- Priority: 9
- Description: Admin 페이지에 마켓 관리, 정산 실행, b값(유동성) 설정, 코인 지급 기능을 추가한다. 와이어프레임 W-08 참조.
- Acceptance Criteria:
  - REQ-057 경기 등록(저장) 시 해당 경기의 마켓이 자동으로 생성됨. 초기 가격: HOME 47.5, AWAY 47.5, DRAW 5.0 (기본값). Admin에서 초기 가격을 커스텀 설정 가능.
  - REQ-058 "정산 실행" 버튼: 경기 결과(HOME/AWAY/DRAW)를 선택하고 정산을 실행. settle_market RPC 호출. 정산 결과(정산 유저 수, 총 배분 코인) 표시.
  - REQ-059 "유동성(b값) 설정" 섹션: 현재 전역 b값 표시 + 변경 입력. 변경 시 이후 생성되는 마켓에 적용 (기존 마켓은 그대로).
  - REQ-060 "코인 지급" 섹션: "전체 유저 코인 지급" 버튼 (금액 입력) + "특정 유저 코인 지급" (학번 + 금액). pg_cron 상태 표시 (마지막 자동 지급 시각).
  - REQ-061 마켓 상태 관리: 마켓 강제 종료(CLOSE) 또는 취소(CANCEL) 기능. 취소 시 모든 유저에게 투자금 원가 환급.

### US-010
- Title: 기존 코드 정리 및 마이그레이션
- Priority: 10
- Description: 기존 승부예측 관련 코드를 정리하고, 새로운 LMSR 시스템으로 전환한다.
- Acceptance Criteria:
  - REQ-062 기존 `predictions` 관련 API 함수 (submitMultiplePredictions, getTodaysGamesWithPredictions 등)를 새로운 마켓/주문 API로 교체.
  - REQ-063 기존 `calculate_daily_matches` RPC를 `settle_market`으로 교체.
  - REQ-064 기존 `get_prediction_ratios_by_date_grouped` RPC를 마켓 가격 표시로 교체.
  - REQ-065 `lib/api.ts`에 새로운 API 함수 추가: `login()`, `changePassword()`, `getMarkets()`, `getMarketDetail()`, `executeBuyOrder()`, `executeSellOrder()`, `executeBuyByAmount()`, `getPositions()`, `getOrderHistory()`, `getWalletBalance()` 등.
  - REQ-066 튜토리얼 페이지 내용을 새로운 LMSR 예측시장 규칙으로 업데이트. 기존 점수제 설명 제거, 토큰 매수/매도 및 0/100 정산 설명으로 교체.

### US-011
- Title: 모바일 UI 스타일 통일 및 반응형 고정
- Priority: 11
- Description: 전체 앱을 모바일 인터페이스 크기로 고정하고 (PC에서도), 기존 스타일 톤을 유지한다.
- Acceptance Criteria:
  - REQ-067 전체 레이아웃 max-width를 430px로 고정. PC에서도 화면 중앙에 모바일 크기로 표시. 외부 배경 `#111111` (어두운색).
  - REQ-068 기존 tokhin-green (#32C600) 브랜딩 컬러, Pretendard 폰트, 하단 네비게이션 패턴 유지.
  - REQ-069 새로 추가되는 UI 컴포넌트 (주문 패널, 가격 표시, 포지션 카드 등)는 기존 shadcn/ui + Tailwind 패턴을 따름. 디자인 철학 섹션의 토큰 참조.
  - REQ-070 하단 네비게이션 메뉴 업데이트: 마켓(홈) / 포지션(히스토리) / 리더보드 / 도움말(튜토리얼). Admin은 기존처럼 별도 경로 `/admin`.

-- US-012: 시즌 시스템 - 스키마 및 데이터 백필
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

-- ============================================================================
-- 개요
-- ----------------------------------------------------------------------------
-- 이 마이그레이션은 ToKHin' LMSR 예측시장 앱에 "시즌(Season)" 개념을 도입한다.
--
-- 변경 사항:
--   1. public.seasons 테이블 신규 추가
--   2. wallets, markets, orders, positions, transactions 5개 테이블에 season_id 컬럼 추가
--   3. 기존 데이터를 KST 기준 2026-03-28 0시를 경계로 Season 0 / Season 1 로 백필
--   4. wallets UNIQUE 제약을 (user_id) → (user_id, season_id) 로 교체
--      (Section 5e-step2 에서 Season 0 지갑 INSERT 이전에 선행하여 교체한다.
--       그래야 동일 user_id 에 대해 Season 0 / Season 1 두 지갑이 공존할 수 있다.
--       Section 8 은 해당 교체가 완료되었는지 재확인하는 idempotent 가드로 축소.)
--   5. Season 0 / Season 1 백필 지갑에 대해 SEASON_GRANT 트랜잭션 동기화
--   6. transactions.type CHECK 제약에 'SEASON_GRANT' 추가
--
-- 시즌 시드 데이터:
--   - Season 0 (id=0): 2026-03-28 KST 이전의 모든 레거시 데이터 버킷, status=ARCHIVED
--   - Season 1 (id=1): 2026-03-28 부터 현재까지 활성 시즌, status=ACTIVE
--   - Season 2 (id=2): 2026-05-19 ~ 2026-06-21 예정 시즌, status=DRAFT (관리자 수동 활성화)
--
-- RPC 함수 수정은 본 마이그레이션에 포함하지 않으며,
-- 후속 마이그레이션 20260518000001 에서 별도로 처리한다.
-- ============================================================================


-- ============================================================================
-- Section 2: public.seasons 테이블 생성
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seasons (
  id SERIAL PRIMARY KEY,
  name VARCHAR NOT NULL UNIQUE,
  start_date DATE,
  end_date DATE,
  status VARCHAR NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_seasons_set_updated_at ON public.seasons;
CREATE TRIGGER trg_seasons_set_updated_at
BEFORE UPDATE ON public.seasons
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ACTIVE 시즌은 동시에 1개만 존재해야 함
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active
  ON public.seasons (status) WHERE status = 'ACTIVE';

-- DRAFT 시즌도 동시에 1개만 존재해야 함
CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_draft
  ON public.seasons (status) WHERE status = 'DRAFT';

-- RLS 활성화 + 공개 SELECT 정책 (다른 public 테이블과 일관)
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seasons_select_all ON public.seasons;
CREATE POLICY seasons_select_all ON public.seasons FOR SELECT USING (TRUE);

GRANT SELECT ON public.seasons TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.seasons_id_seq TO anon, authenticated;


-- ============================================================================
-- Section 3: 시즌 시드 데이터 (명시적 ID 0, 1, 2)
-- ============================================================================

INSERT INTO public.seasons (id, name, start_date, end_date, status, created_at, updated_at)
VALUES
  (0, 'Season 0', NULL, DATE '2026-03-27', 'ARCHIVED', NOW(), NOW()),
  (1, 'Season 1', DATE '2026-03-28', NULL, 'ACTIVE', NOW(), NOW()),
  (2, 'Season 2', DATE '2026-05-19', DATE '2026-06-21', 'DRAFT', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 시퀀스를 재설정해서 다음 자동 ID 가 3 부터 시작하도록 보정
SELECT setval(
  'public.seasons_id_seq',
  GREATEST(2, (SELECT COALESCE(MAX(id), 0) FROM public.seasons))
);


-- ============================================================================
-- Section 4: 5개 테이블에 nullable season_id 컬럼 추가
-- ============================================================================

ALTER TABLE public.wallets       ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES public.seasons(id) ON DELETE RESTRICT;
ALTER TABLE public.markets       ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES public.seasons(id) ON DELETE RESTRICT;
ALTER TABLE public.orders        ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES public.seasons(id) ON DELETE RESTRICT;
ALTER TABLE public.positions     ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES public.seasons(id) ON DELETE RESTRICT;
ALTER TABLE public.transactions  ADD COLUMN IF NOT EXISTS season_id INTEGER REFERENCES public.seasons(id) ON DELETE RESTRICT;


-- ============================================================================
-- Section 5: season_id 백필
-- ----------------------------------------------------------------------------
-- 컷오프: 2026-03-28 00:00 KST = 2026-03-27 15:00 UTC
--   - games.game_date < 2026-03-28        → Season 0
--   - games.game_date >= 2026-03-28       → Season 1
--   - transactions.created_at < 컷오프(UTC) → Season 0
--
-- 5e (wallets) 는 3단계로 진행한다:
--   step1) 기존 wallets 모두 season_id=1 로 표시
--   step2) wallets UNIQUE 제약을 (user_id) → (user_id, season_id) 로 선행 교체
--          (없으면 step3 INSERT 가 기존 (user_id) UNIQUE 와 충돌하여 silent no-op)
--   step3) pre-cutoff 거래 보유 사용자에게 Season 0 지갑 INSERT
--          (ON CONFLICT 타겟을 (user_id, season_id) 로 명시하여 멱등성 확보)
-- ============================================================================

-- 5a) markets.season_id ← games.game_date
UPDATE public.markets m
SET season_id = CASE
  WHEN g.game_date < DATE '2026-03-28' THEN 0
  ELSE 1
END
FROM public.games g
WHERE g.id = m.game_id AND m.season_id IS NULL;

-- 5b) orders.season_id ← markets.season_id
UPDATE public.orders o
SET season_id = m.season_id
FROM public.markets m
WHERE m.id = o.market_id AND o.season_id IS NULL;

-- 5c) positions.season_id ← markets.season_id
UPDATE public.positions p
SET season_id = m.season_id
FROM public.markets m
WHERE m.id = p.market_id AND p.season_id IS NULL;

-- 5d) transactions.season_id ← created_at 컷오프
UPDATE public.transactions t
SET season_id = CASE
  WHEN t.created_at < TIMESTAMPTZ '2026-03-27 15:00:00+00' THEN 0
  ELSE 1
END
WHERE t.season_id IS NULL;

-- 5e-step1) 기존 wallets 행은 모두 Season 1 지갑으로 간주
UPDATE public.wallets
SET season_id = 1, updated_at = NOW()
WHERE season_id IS NULL;

-- 5e-step2) wallets UNIQUE 제약을 (user_id) → (user_id, season_id) 로 선행 교체
--           이 단계가 없으면 step3 INSERT 가 기존 wallets_user_id_key (user_id) UNIQUE
--           와 충돌하여 ON CONFLICT 로 silently no-op 된다. 결과적으로 Season 0 지갑이
--           하나도 생성되지 않아 데이터 무결성이 깨진다.
--           NOT NULL 강제는 Section 7 까지 미루므로, 이 시점에서는 season_id NULL 행도
--           이론상 허용되지만, Section 5d 까지 transactions 가 모두 백필되었기 때문에
--           실질적으로 NULL 행은 더 이상 없다.
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_user_season_key'
      AND conrelid = 'public.wallets'::regclass
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_user_season_key UNIQUE (user_id, season_id);
  END IF;
END $$;

-- 5e-step3) pre-cutoff 트랜잭션이 있는 사용자에게 Season 0 지갑 생성
--           잔고는 해당 사용자의 가장 마지막 pre-cutoff 트랜잭션의 balance_after 사용.
--           이 시점에 wallets UNIQUE 는 (user_id, season_id) 이므로 ON CONFLICT 타겟을
--           명시적으로 (user_id, season_id) 로 지정하여 재실행 시에도 멱등성을 보장한다.
INSERT INTO public.wallets (user_id, season_id, balance, created_at, updated_at)
SELECT DISTINCT ON (t.user_id)
  t.user_id,
  0 AS season_id,
  t.balance_after,
  NOW(),
  NOW()
FROM public.transactions t
WHERE t.created_at < TIMESTAMPTZ '2026-03-27 15:00:00+00'
ORDER BY t.user_id, t.created_at DESC, t.id DESC
ON CONFLICT (user_id, season_id) DO NOTHING;


-- ============================================================================
-- Section 6: SEASON_GRANT 트랜잭션 동기화 + type CHECK 확장
-- ============================================================================

-- 6a) transactions.type CHECK 제약 확장: SEASON_GRANT 허용
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('BUY', 'SELL', 'SETTLEMENT', 'WEEKLY_GRANT', 'ADMIN_GRANT', 'SEASON_GRANT'));

-- 6b) Season 0 지갑 보유 사용자에게 SEASON_GRANT (1000) 합성
--     이미 동일 (user_id, season_id=0, type='SEASON_GRANT') 트랜잭션이 있으면 스킵 → 멱등성
INSERT INTO public.transactions (user_id, type, amount, balance_after, reference_id, description, created_at, season_id)
SELECT
  w.user_id,
  'SEASON_GRANT',
  1000,
  1000,
  NULL,
  'Season 0 시작 코인 지급 (백필)',
  TIMESTAMPTZ '2026-02-24 00:00:00+09',
  0
FROM public.wallets w
WHERE w.season_id = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.user_id = w.user_id
      AND t.season_id = 0
      AND t.type = 'SEASON_GRANT'
  );

-- 6c) Season 1 지갑 보유 사용자에게 SEASON_GRANT (1000) 합성
INSERT INTO public.transactions (user_id, type, amount, balance_after, reference_id, description, created_at, season_id)
SELECT
  w.user_id,
  'SEASON_GRANT',
  1000,
  1000,
  NULL,
  'Season 1 시작 코인 지급 (백필)',
  TIMESTAMPTZ '2026-03-28 00:00:00+09',
  1
FROM public.wallets w
WHERE w.season_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.user_id = w.user_id
      AND t.season_id = 1
      AND t.type = 'SEASON_GRANT'
  );


-- ============================================================================
-- Section 7: NOT NULL 강제 + 백필 검증
-- ============================================================================

-- NULL 행이 남아 있으면 즉시 실패시켜 트랜잭션 롤백
DO $$
DECLARE
  v_null_wallets       BIGINT;
  v_null_markets       BIGINT;
  v_null_orders        BIGINT;
  v_null_positions     BIGINT;
  v_null_transactions  BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_null_wallets       FROM public.wallets       WHERE season_id IS NULL;
  SELECT COUNT(*) INTO v_null_markets       FROM public.markets       WHERE season_id IS NULL;
  SELECT COUNT(*) INTO v_null_orders        FROM public.orders        WHERE season_id IS NULL;
  SELECT COUNT(*) INTO v_null_positions     FROM public.positions     WHERE season_id IS NULL;
  SELECT COUNT(*) INTO v_null_transactions  FROM public.transactions  WHERE season_id IS NULL;

  IF v_null_wallets > 0 THEN
    RAISE EXCEPTION 'season_id가 NULL인 wallets 행이 %개 존재합니다', v_null_wallets;
  END IF;
  IF v_null_markets > 0 THEN
    RAISE EXCEPTION 'season_id가 NULL인 markets 행이 %개 존재합니다', v_null_markets;
  END IF;
  IF v_null_orders > 0 THEN
    RAISE EXCEPTION 'season_id가 NULL인 orders 행이 %개 존재합니다', v_null_orders;
  END IF;
  IF v_null_positions > 0 THEN
    RAISE EXCEPTION 'season_id가 NULL인 positions 행이 %개 존재합니다', v_null_positions;
  END IF;
  IF v_null_transactions > 0 THEN
    RAISE EXCEPTION 'season_id가 NULL인 transactions 행이 %개 존재합니다', v_null_transactions;
  END IF;
END $$;

ALTER TABLE public.wallets       ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE public.markets       ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE public.orders        ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE public.positions     ALTER COLUMN season_id SET NOT NULL;
ALTER TABLE public.transactions  ALTER COLUMN season_id SET NOT NULL;


-- ============================================================================
-- Section 8: wallets UNIQUE 제약 상태 검증
-- ----------------------------------------------------------------------------
-- 제약 교체는 Section 5e-step2 에서 이미 완료되었다. 본 섹션은 최종 상태를 재확인하는
-- idempotent 가드이며, 어떤 이유로든 교체가 누락된 경우 즉시 마이그레이션을 중단시킨다.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_user_id_key'
      AND conrelid = 'public.wallets'::regclass
  ) THEN
    RAISE EXCEPTION 'wallets_user_id_key 제약이 아직 존재합니다 (Section 5e-step2 미실행)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallets_user_season_key'
      AND conrelid = 'public.wallets'::regclass
  ) THEN
    RAISE EXCEPTION 'wallets_user_season_key UNIQUE 제약이 누락되었습니다 (Section 5e-step2 미실행)';
  END IF;
END $$;


-- ============================================================================
-- Section 9: 성능용 인덱스
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_markets_season            ON public.markets       (season_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_season        ON public.orders        (user_id, season_id);
CREATE INDEX IF NOT EXISTS idx_positions_user_season     ON public.positions     (user_id, season_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_season  ON public.transactions  (user_id, season_id);
CREATE INDEX IF NOT EXISTS idx_transactions_season_type  ON public.transactions  (season_id, type);
CREATE INDEX IF NOT EXISTS idx_wallets_season            ON public.wallets       (season_id);


-- ============================================================================
-- Section 10: 최종 무결성 검증
-- ============================================================================

DO $$
DECLARE
  v_season_count  INTEGER;
  v_active_count  INTEGER;
  v_draft_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_season_count FROM public.seasons;
  SELECT COUNT(*) INTO v_active_count FROM public.seasons WHERE status = 'ACTIVE';
  SELECT COUNT(*) INTO v_draft_count  FROM public.seasons WHERE status = 'DRAFT';

  IF v_season_count < 3 THEN
    RAISE EXCEPTION 'seasons 테이블에 3개의 시즌이 모두 존재해야 합니다 (현재: %)', v_season_count;
  END IF;
  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'ACTIVE 시즌이 정확히 1개여야 합니다 (현재: %)', v_active_count;
  END IF;
  IF v_draft_count <> 1 THEN
    RAISE EXCEPTION 'DRAFT 시즌이 정확히 1개여야 합니다 (현재: %)', v_draft_count;
  END IF;

  RAISE NOTICE '시즌 시스템 스키마 마이그레이션 완료: 시즌 %개, ACTIVE %개, DRAFT %개',
    v_season_count, v_active_count, v_draft_count;
END $$;

-- US-012: 시즌 시스템 - RPC 함수 추가/수정
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`
-- 이 마이그레이션은 20260518000000_us_seasons_schema.sql 적용 후 실행되어야 한다.

-- ============================================================================
-- 시즌 인지(season-aware) RPC 계약 요약
-- ----------------------------------------------------------------------------
--   - 거래/지갑/정산은 항상 v_market.season_id 에 귀속된
--     지갑/주문/포지션/트랜잭션에서만 이루어진다.
--   - ACTIVE 시즌이 아닌 시즌의 마켓은 거래/정산이 모두 차단된다.
--   - 리더보드/히스토리는 p_season_id DEFAULT NULL 을 받아
--     NULL 이면 현재 ACTIVE 시즌으로 자동 해결한다.
--   - 보존되는 불변 규칙: 폐장 시간(KST 01:00~09:00), 30분 매도 쿨다운,
--     LMSR 수식, KST 타임존, purchased_at 업데이트.
-- ============================================================================


-- ============================================================================
-- SECTION A: 시즌 라이프사이클 RPC
-- ============================================================================

-- A1. get_active_season: 현재 ACTIVE 시즌 조회
CREATE OR REPLACE FUNCTION public.get_active_season()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season public.seasons%ROWTYPE;
BEGIN
  SELECT *
  INTO v_season
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '활성 시즌이 없습니다'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season', jsonb_build_object(
      'id', v_season.id,
      'name', v_season.name,
      'start_date', v_season.start_date,
      'end_date', v_season.end_date,
      'status', v_season.status
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- A2. list_seasons: 전체 시즌 목록 (ID DESC)
CREATE OR REPLACE FUNCTION public.list_seasons()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_seasons JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'start_date', s.start_date,
        'end_date', s.end_date,
        'status', s.status,
        'created_at', s.created_at
      )
      ORDER BY s.id DESC
    ),
    '[]'::JSONB
  )
  INTO v_seasons
  FROM public.seasons s;

  RETURN jsonb_build_object(
    'success', TRUE,
    'seasons', v_seasons
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- A3. create_season: 신규 DRAFT 시즌 생성
CREATE OR REPLACE FUNCTION public.create_season(
  p_name TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_name TEXT;
  v_existing_draft_count INTEGER;
  v_season public.seasons%ROWTYPE;
BEGIN
  v_name := BTRIM(COALESCE(p_name, ''));

  IF v_name = '' THEN
    RAISE EXCEPTION '시즌 이름이 비어 있습니다';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION '시즌 시작일과 종료일은 모두 입력해야 합니다';
  END IF;

  IF p_start_date >= p_end_date THEN
    RAISE EXCEPTION '시즌 시작일은 종료일보다 이전이어야 합니다';
  END IF;

  SELECT COUNT(*)
  INTO v_existing_draft_count
  FROM public.seasons
  WHERE status = 'DRAFT';

  IF v_existing_draft_count > 0 THEN
    RAISE EXCEPTION '이미 DRAFT 상태의 시즌이 존재합니다. 활성화 또는 정리 후 새 시즌을 생성해주세요';
  END IF;

  INSERT INTO public.seasons (name, start_date, end_date, status, created_at, updated_at)
  VALUES (v_name, p_start_date, p_end_date, 'DRAFT', NOW(), NOW())
  RETURNING * INTO v_season;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season', jsonb_build_object(
      'id', v_season.id,
      'name', v_season.name,
      'start_date', v_season.start_date,
      'end_date', v_season.end_date,
      'status', v_season.status,
      'created_at', v_season.created_at
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- A4. activate_season: DRAFT → ACTIVE 전환 + 이전 ACTIVE → ARCHIVED + 신규 시즌 코인 지급
CREATE OR REPLACE FUNCTION public.activate_season(
  p_season_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target public.seasons%ROWTYPE;
  v_active public.seasons%ROWTYPE;
  v_pending_count INTEGER := 0;
  v_pending_ids TEXT;
  v_users_granted INTEGER := 0;
  v_user_row RECORD;
  v_inserted_wallet_id UUID;
BEGIN
  IF p_season_id IS NULL THEN
    RAISE EXCEPTION '시즌 정보가 올바르지 않습니다';
  END IF;

  -- 1) 대상 시즌 잠금 + 상태 검증
  SELECT *
  INTO v_target
  FROM public.seasons
  WHERE id = p_season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '시즌을 찾을 수 없습니다';
  END IF;

  IF v_target.status <> 'DRAFT' THEN
    RAISE EXCEPTION '해당 시즌은 활성화 가능한 DRAFT 상태가 아닙니다';
  END IF;

  -- 2) 현재 ACTIVE 시즌 잠금 (있을 경우)
  SELECT *
  INTO v_active
  FROM public.seasons
  WHERE status = 'ACTIVE'
  FOR UPDATE;

  -- 3) 이전 시즌에 미정산 마켓이 있는지 확인
  IF FOUND THEN
    SELECT COUNT(*)
    INTO v_pending_count
    FROM public.markets
    WHERE season_id = v_active.id
      AND status IN ('OPEN', 'CLOSED');

    IF v_pending_count > 0 THEN
      SELECT string_agg(id::TEXT, ', ' ORDER BY id)
      INTO v_pending_ids
      FROM (
        SELECT id
        FROM public.markets
        WHERE season_id = v_active.id
          AND status IN ('OPEN', 'CLOSED')
        ORDER BY id
        LIMIT 5
      ) sub;

      RAISE EXCEPTION '이전 시즌에 정산되지 않은 마켓이 %개 있습니다 (마켓 ID: %)',
        v_pending_count, v_pending_ids;
    END IF;

    -- 4) 이전 ACTIVE → ARCHIVED
    UPDATE public.seasons
    SET
      status = 'ARCHIVED',
      end_date = CURRENT_DATE,
      updated_at = NOW()
    WHERE id = v_active.id;
  END IF;

  -- 5) 대상 DRAFT → ACTIVE
  UPDATE public.seasons
  SET
    status = 'ACTIVE',
    updated_at = NOW()
  WHERE id = v_target.id;

  -- 6) 신규 시즌 지갑 생성 (balance=1000) 및 SEASON_GRANT 트랜잭션 기록
  --    ON CONFLICT (user_id, season_id) 가드를 통해 재실행 시 멱등성 확보
  FOR v_user_row IN
    SELECT id AS user_id FROM public.users
  LOOP
    v_inserted_wallet_id := NULL;

    INSERT INTO public.wallets (user_id, season_id, balance, created_at, updated_at)
    VALUES (v_user_row.user_id, p_season_id, 1000, NOW(), NOW())
    ON CONFLICT (user_id, season_id) DO NOTHING
    RETURNING id INTO v_inserted_wallet_id;

    IF v_inserted_wallet_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        user_id, type, amount, balance_after, reference_id,
        description, created_at, season_id
      )
      VALUES (
        v_user_row.user_id, 'SEASON_GRANT', 1000, 1000, NULL,
        '시즌 시작 코인 지급', NOW(), p_season_id
      );

      v_users_granted := v_users_granted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season_id', p_season_id,
    'users_granted', v_users_granted
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- A5. end_season: ACTIVE → ARCHIVED (미정산 마켓 있으면 차단)
CREATE OR REPLACE FUNCTION public.end_season(
  p_season_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season public.seasons%ROWTYPE;
  v_pending_count INTEGER := 0;
  v_pending_ids TEXT;
BEGIN
  IF p_season_id IS NULL THEN
    RAISE EXCEPTION '시즌 정보가 올바르지 않습니다';
  END IF;

  SELECT *
  INTO v_season
  FROM public.seasons
  WHERE id = p_season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '시즌을 찾을 수 없습니다';
  END IF;

  IF v_season.status <> 'ACTIVE' THEN
    RAISE EXCEPTION '해당 시즌은 ACTIVE 상태가 아니므로 종료할 수 없습니다';
  END IF;

  SELECT COUNT(*)
  INTO v_pending_count
  FROM public.markets
  WHERE season_id = p_season_id
    AND status IN ('OPEN', 'CLOSED');

  IF v_pending_count > 0 THEN
    SELECT string_agg(id::TEXT, ', ' ORDER BY id)
    INTO v_pending_ids
    FROM (
      SELECT id
      FROM public.markets
      WHERE season_id = p_season_id
        AND status IN ('OPEN', 'CLOSED')
      ORDER BY id
      LIMIT 5
    ) sub;

    RAISE EXCEPTION '이전 시즌에 정산되지 않은 마켓이 %개 있습니다 (마켓 ID: %)',
      v_pending_count, v_pending_ids;
  END IF;

  UPDATE public.seasons
  SET
    status = 'ARCHIVED',
    end_date = CURRENT_DATE,
    updated_at = NOW()
  WHERE id = p_season_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season_id', p_season_id,
    'status', 'ARCHIVED'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- ============================================================================
-- SECTION B: 지갑/지급 RPC 업데이트
-- ============================================================================

-- B1. login: 인증 + 활성 시즌 지갑 자동 생성 + SEASON_GRANT
CREATE OR REPLACE FUNCTION public.login(
  p_student_number BIGINT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user RECORD;
  v_input_hash TEXT;
  v_active public.seasons%ROWTYPE;
  v_inserted_wallet_id UUID;
BEGIN
  SELECT id, username, password_hash, password_changed
  INTO v_user
  FROM public.users
  WHERE student_number = p_student_number
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '학번 또는 비밀번호가 올바르지 않습니다'
    );
  END IF;

  v_input_hash := encode(digest(COALESCE(p_password, ''), 'sha256'), 'hex');

  IF v_user.password_hash IS NULL OR v_user.password_hash <> v_input_hash THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '학번 또는 비밀번호가 올바르지 않습니다'
    );
  END IF;

  -- 활성 시즌 조회
  SELECT *
  INTO v_active
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'login 처리 중 활성 시즌을 찾을 수 없습니다'
    );
  END IF;

  -- 활성 시즌 지갑 자동 생성 (balance=1000) + SEASON_GRANT
  v_inserted_wallet_id := NULL;

  INSERT INTO public.wallets (user_id, season_id, balance, created_at, updated_at)
  VALUES (v_user.id, v_active.id, 1000, NOW(), NOW())
  ON CONFLICT (user_id, season_id) DO NOTHING
  RETURNING id INTO v_inserted_wallet_id;

  IF v_inserted_wallet_id IS NOT NULL THEN
    INSERT INTO public.transactions (
      user_id, type, amount, balance_after, reference_id,
      description, created_at, season_id
    )
    VALUES (
      v_user.id, 'SEASON_GRANT', 1000, 1000, NULL,
      '시즌 시작 코인 지급', NOW(), v_active.id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user.id,
    'username', v_user.username,
    'password_changed', COALESCE(v_user.password_changed, FALSE)
  );
END;
$$;


-- B2. get_wallet_balance: 활성 시즌 또는 지정 시즌 잔고 조회
DROP FUNCTION IF EXISTS public.get_wallet_balance(UUID);
CREATE OR REPLACE FUNCTION public.get_wallet_balance(
  p_user_id UUID,
  p_season_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season_id INTEGER;
  v_balance NUMERIC;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM public.seasons
    WHERE status = 'ACTIVE'
    LIMIT 1;

    IF v_season_id IS NULL THEN
      RAISE EXCEPTION '활성 시즌이 없습니다';
    END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  SELECT balance
  INTO v_balance
  FROM public.wallets
  WHERE user_id = p_user_id
    AND season_id = v_season_id
  LIMIT 1;

  IF NOT FOUND THEN
    -- 시즌 중 미가입 사용자도 호출 가능하므로 0 으로 응답 (예외 아님)
    RETURN jsonb_build_object(
      'success', TRUE,
      'balance', 0,
      'season_id', v_season_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'balance', v_balance,
    'season_id', v_season_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- B3. distribute_weekly_coins: 활성 시즌 지갑에 주간 코인 지급
--     pg_cron weekly_coin_distribution 작업이 호출하므로 시그니처 (p_amount DEFAULT 300) 고정.
CREATE OR REPLACE FUNCTION public.distribute_weekly_coins(
  p_amount NUMERIC DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_active public.seasons%ROWTYPE;
  v_users_count INTEGER := 0;
  v_total_distributed NUMERIC := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '지급 코인은 0보다 커야 합니다';
  END IF;

  SELECT *
  INTO v_active
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '활성 시즌이 없어 주간 코인을 지급할 수 없습니다';
  END IF;

  -- 활성 시즌 지갑이 없는 사용자에게 잔고 0 지갑을 선제 생성 (방어적)
  INSERT INTO public.wallets (user_id, season_id, balance, created_at, updated_at)
  SELECT u.id, v_active.id, 0, NOW(), NOW()
  FROM public.users u
  ON CONFLICT (user_id, season_id) DO NOTHING;

  -- 활성 시즌 지갑에 한해 잔고 + p_amount, 트랜잭션 동시 INSERT
  WITH updated_wallets AS (
    UPDATE public.wallets w
    SET
      balance = w.balance + p_amount,
      updated_at = NOW()
    FROM public.users u
    WHERE u.id = w.user_id
      AND w.season_id = v_active.id
    RETURNING w.user_id, w.balance
  ), inserted_transactions AS (
    INSERT INTO public.transactions (
      user_id, type, amount, balance_after, reference_id,
      description, season_id
    )
    SELECT
      uw.user_id, 'WEEKLY_GRANT', p_amount, uw.balance, NULL,
      '주간 코인 지급', v_active.id
    FROM updated_wallets uw
    RETURNING user_id
  )
  SELECT
    COUNT(*),
    COALESCE(COUNT(*) * p_amount, 0)
  INTO v_users_count, v_total_distributed
  FROM inserted_transactions;

  RETURN jsonb_build_object(
    'success', TRUE,
    'users_count', v_users_count,
    'total_distributed', v_total_distributed
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- B4. admin_grant_coins: 활성 시즌 지갑에 단건 지급
CREATE OR REPLACE FUNCTION public.admin_grant_coins(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_active public.seasons%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '지급 코인은 0보다 커야 합니다';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다';
  END IF;

  SELECT *
  INTO v_active
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  -- 활성 시즌 지갑 잠금 (없으면 0 잔고 INSERT 후 재잠금)
  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
    AND season_id = v_active.id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, season_id, balance, created_at, updated_at)
    VALUES (p_user_id, v_active.id, 0, NOW(), NOW())
    ON CONFLICT (user_id, season_id) DO NOTHING;

    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = p_user_id
      AND season_id = v_active.id
    FOR UPDATE;
  END IF;

  v_new_balance := v_wallet.balance + p_amount;

  UPDATE public.wallets
  SET
    balance = v_new_balance,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, reference_id,
    description, season_id
  )
  VALUES (
    p_user_id, 'ADMIN_GRANT', p_amount, v_new_balance, NULL,
    '관리자 코인 지급', v_active.id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', p_user_id,
    'granted_amount', p_amount,
    'new_balance', v_new_balance
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- ============================================================================
-- SECTION C: LMSR 거래 RPC 업데이트
-- ============================================================================
-- 보존: 폐장 시간 (KST 01:00 ~ 09:00), 30분 매도 쿨다운, LMSR 비용 계산, purchased_at
-- 추가: 시즌 일치 검증 (이 시즌은 더 이상 거래할 수 없습니다)
-- 변경: 지갑/주문/포지션/트랜잭션 모두 v_market.season_id 에 귀속
-- ============================================================================

-- C1. execute_buy_order: 시즌 인지 매수
CREATE OR REPLACE FUNCTION public.execute_buy_order(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_outcome TEXT;
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
  v_wallet public.wallets%ROWTYPE;
  v_position public.positions%ROWTYPE;
  v_new_q_home NUMERIC;
  v_new_q_away NUMERIC;
  v_new_q_draw NUMERIC;
  v_cost_before NUMERIC;
  v_cost_after NUMERIC;
  v_total_cost NUMERIC;
  v_avg_price NUMERIC;
  v_new_balance NUMERIC;
  v_new_position_qty NUMERIC;
  v_new_avg_entry_price NUMERIC;
  v_order_id INTEGER;
BEGIN
  -- 폐장 시간 체크 (KST 01:00 ~ 09:00)
  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) >= 1
     AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) < 9 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '폐장 시간입니다 (새벽 1시 ~ 오전 9시). 오전 9시 이후에 거래해주세요.'
    );
  END IF;

  v_outcome := UPPER(BTRIM(COALESCE(p_outcome, '')));

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION '매수 수량은 0보다 커야 합니다';
  END IF;

  IF v_outcome NOT IN ('HOME', 'AWAY', 'DRAW') THEN
    RAISE EXCEPTION 'outcome은 HOME, AWAY, DRAW 중 하나여야 합니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status <> 'OPEN' THEN
    RAISE EXCEPTION '현재 거래할 수 없는 마켓입니다';
  END IF;

  -- 시즌 검증: 마켓의 시즌이 현재 ACTIVE 시즌이어야 거래 가능
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '이 시즌은 더 이상 거래할 수 없습니다';
  END IF;

  v_new_q_home := v_market.q_home;
  v_new_q_away := v_market.q_away;
  v_new_q_draw := v_market.q_draw;

  CASE v_outcome
    WHEN 'HOME' THEN v_new_q_home := v_new_q_home + p_quantity;
    WHEN 'AWAY' THEN v_new_q_away := v_new_q_away + p_quantity;
    WHEN 'DRAW' THEN v_new_q_draw := v_new_q_draw + p_quantity;
  END CASE;

  v_cost_before := public.lmsr_cost(v_market.q_home, v_market.q_away, v_market.q_draw, v_market.b);
  v_cost_after := public.lmsr_cost(v_new_q_home, v_new_q_away, v_new_q_draw, v_market.b);
  v_total_cost := 100 * (v_cost_after - v_cost_before);

  IF v_total_cost <= 0 THEN
    RAISE EXCEPTION '주문 비용 계산에 실패했습니다';
  END IF;

  v_avg_price := v_total_cost / p_quantity;

  -- 시즌 인지 지갑 잠금
  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
    AND season_id = v_market.season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '지갑 정보를 찾을 수 없습니다';
  END IF;

  IF v_wallet.balance < v_total_cost THEN
    RAISE EXCEPTION '잔고가 부족합니다';
  END IF;

  v_new_balance := v_wallet.balance - v_total_cost;

  UPDATE public.wallets
  SET
    balance = v_new_balance,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  UPDATE public.markets
  SET
    q_home = v_new_q_home,
    q_away = v_new_q_away,
    q_draw = v_new_q_draw,
    updated_at = NOW()
  WHERE id = v_market.id;

  SELECT *
  INTO v_position
  FROM public.positions
  WHERE user_id = p_user_id
    AND market_id = p_market_id
    AND outcome = v_outcome
  FOR UPDATE;

  IF FOUND THEN
    v_new_position_qty := v_position.quantity + p_quantity;
    v_new_avg_entry_price := (
      (v_position.quantity * v_position.avg_entry_price) +
      (p_quantity * v_avg_price)
    ) / v_new_position_qty;

    UPDATE public.positions
    SET
      quantity = v_new_position_qty,
      avg_entry_price = v_new_avg_entry_price,
      purchased_at = NOW(),
      updated_at = NOW()
    WHERE id = v_position.id;
  ELSE
    INSERT INTO public.positions (
      user_id, market_id, outcome, quantity, avg_entry_price,
      purchased_at, updated_at, season_id
    )
    VALUES (
      p_user_id, p_market_id, v_outcome, p_quantity, v_avg_price,
      NOW(), NOW(), v_market.season_id
    );
  END IF;

  INSERT INTO public.orders (
    user_id, market_id, outcome, side, quantity, total_cost, avg_price, season_id
  )
  VALUES (
    p_user_id, p_market_id, v_outcome, 'BUY', p_quantity, v_total_cost, v_avg_price, v_market.season_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, reference_id, description, season_id
  )
  VALUES (
    p_user_id, 'BUY', -v_total_cost, v_new_balance, v_order_id, '매수 주문 체결', v_market.season_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'quantity', p_quantity,
    'total_cost', v_total_cost,
    'avg_price', v_avg_price,
    'new_balance', v_new_balance
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C2. execute_sell_order: 시즌 인지 매도 (30분 쿨다운 보존)
CREATE OR REPLACE FUNCTION public.execute_sell_order(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_outcome TEXT;
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
  v_wallet public.wallets%ROWTYPE;
  v_position public.positions%ROWTYPE;
  v_new_q_home NUMERIC;
  v_new_q_away NUMERIC;
  v_new_q_draw NUMERIC;
  v_cost_before NUMERIC;
  v_cost_after NUMERIC;
  v_total_refund NUMERIC;
  v_avg_price NUMERIC;
  v_new_balance NUMERIC;
  v_new_position_qty NUMERIC;
  v_order_id INTEGER;
BEGIN
  -- 폐장 시간 체크 (KST 01:00 ~ 09:00)
  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) >= 1
     AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) < 9 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '폐장 시간입니다 (새벽 1시 ~ 오전 9시). 오전 9시 이후에 거래해주세요.'
    );
  END IF;

  v_outcome := UPPER(BTRIM(COALESCE(p_outcome, '')));

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION '매도 수량은 0보다 커야 합니다';
  END IF;

  IF v_outcome NOT IN ('HOME', 'AWAY', 'DRAW') THEN
    RAISE EXCEPTION 'outcome은 HOME, AWAY, DRAW 중 하나여야 합니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status <> 'OPEN' THEN
    RAISE EXCEPTION '현재 거래할 수 없는 마켓입니다';
  END IF;

  -- 시즌 검증
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '이 시즌은 더 이상 거래할 수 없습니다';
  END IF;

  SELECT *
  INTO v_position
  FROM public.positions
  WHERE user_id = p_user_id
    AND market_id = p_market_id
    AND outcome = v_outcome
  FOR UPDATE;

  IF NOT FOUND OR v_position.quantity < p_quantity THEN
    RAISE EXCEPTION '보유 수량이 부족합니다';
  END IF;

  -- 30분 매도 쿨다운 (보존)
  IF v_position.purchased_at IS NOT NULL AND
     (NOW() AT TIME ZONE 'Asia/Seoul') - (v_position.purchased_at AT TIME ZONE 'Asia/Seoul') < INTERVAL '30 minutes' THEN
    RAISE EXCEPTION '매수 후 30분이 지나야 매도할 수 있습니다';
  END IF;

  v_new_q_home := v_market.q_home;
  v_new_q_away := v_market.q_away;
  v_new_q_draw := v_market.q_draw;

  CASE v_outcome
    WHEN 'HOME' THEN v_new_q_home := v_new_q_home - p_quantity;
    WHEN 'AWAY' THEN v_new_q_away := v_new_q_away - p_quantity;
    WHEN 'DRAW' THEN v_new_q_draw := v_new_q_draw - p_quantity;
  END CASE;

  v_cost_before := public.lmsr_cost(v_market.q_home, v_market.q_away, v_market.q_draw, v_market.b);
  v_cost_after := public.lmsr_cost(v_new_q_home, v_new_q_away, v_new_q_draw, v_market.b);
  v_total_refund := 100 * (v_cost_before - v_cost_after);

  IF v_total_refund <= 0 THEN
    RAISE EXCEPTION '환급금 계산에 실패했습니다';
  END IF;

  v_avg_price := v_total_refund / p_quantity;

  -- 시즌 인지 지갑 잠금
  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
    AND season_id = v_market.season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '지갑 정보를 찾을 수 없습니다';
  END IF;

  v_new_balance := v_wallet.balance + v_total_refund;

  UPDATE public.markets
  SET
    q_home = v_new_q_home,
    q_away = v_new_q_away,
    q_draw = v_new_q_draw,
    updated_at = NOW()
  WHERE id = v_market.id;

  v_new_position_qty := v_position.quantity - p_quantity;

  UPDATE public.positions
  SET
    quantity = v_new_position_qty,
    avg_entry_price = CASE
      WHEN v_new_position_qty = 0 THEN 0
      ELSE avg_entry_price
    END,
    updated_at = NOW()
  WHERE id = v_position.id;

  UPDATE public.wallets
  SET
    balance = v_new_balance,
    updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO public.orders (
    user_id, market_id, outcome, side, quantity, total_cost, avg_price, season_id
  )
  VALUES (
    p_user_id, p_market_id, v_outcome, 'SELL', p_quantity, v_total_refund, v_avg_price, v_market.season_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, reference_id, description, season_id
  )
  VALUES (
    p_user_id, 'SELL', v_total_refund, v_new_balance, v_order_id, '매도 주문 체결', v_market.season_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'quantity', p_quantity,
    'total_refund', v_total_refund,
    'avg_price', v_avg_price,
    'new_balance', v_new_balance
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C3. execute_buy_by_amount: 시즌 인지 금액 기반 매수
CREATE OR REPLACE FUNCTION public.execute_buy_by_amount(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_outcome TEXT;
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
  v_wallet public.wallets%ROWTYPE;
  v_cost_before NUMERIC;
  v_estimated_cost NUMERIC;
  v_low NUMERIC := 0;
  v_high NUMERIC := 1;
  v_mid NUMERIC;
  v_quantity NUMERIC;
  v_new_q_home NUMERIC;
  v_new_q_away NUMERIC;
  v_new_q_draw NUMERIC;
  v_result JSONB;
  v_i INTEGER;
BEGIN
  -- 폐장 시간 체크 (KST 01:00 ~ 09:00)
  IF EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) >= 1
     AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul')) < 9 THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', '폐장 시간입니다 (새벽 1시 ~ 오전 9시). 오전 9시 이후에 거래해주세요.'
    );
  END IF;

  v_outcome := UPPER(BTRIM(COALESCE(p_outcome, '')));

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '매수 금액은 0보다 커야 합니다';
  END IF;

  IF v_outcome NOT IN ('HOME', 'AWAY', 'DRAW') THEN
    RAISE EXCEPTION 'outcome은 HOME, AWAY, DRAW 중 하나여야 합니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status <> 'OPEN' THEN
    RAISE EXCEPTION '현재 거래할 수 없는 마켓입니다';
  END IF;

  -- 시즌 검증 (execute_buy_order 내부에서도 한 번 더 검사되지만 명확한 에러를 위해 선검사)
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '이 시즌은 더 이상 거래할 수 없습니다';
  END IF;

  -- 시즌 인지 지갑 잠금
  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
    AND season_id = v_market.season_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '지갑 정보를 찾을 수 없습니다';
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION '잔고가 부족합니다';
  END IF;

  v_cost_before := public.lmsr_cost(v_market.q_home, v_market.q_away, v_market.q_draw, v_market.b);

  -- 이진탐색: high 부터 비용이 p_amount 를 넘을 때까지 2배씩 확장
  FOR v_i IN 1..60 LOOP
    v_new_q_home := v_market.q_home;
    v_new_q_away := v_market.q_away;
    v_new_q_draw := v_market.q_draw;

    CASE v_outcome
      WHEN 'HOME' THEN v_new_q_home := v_new_q_home + v_high;
      WHEN 'AWAY' THEN v_new_q_away := v_new_q_away + v_high;
      WHEN 'DRAW' THEN v_new_q_draw := v_new_q_draw + v_high;
    END CASE;

    v_estimated_cost := 100 * (
      public.lmsr_cost(v_new_q_home, v_new_q_away, v_new_q_draw, v_market.b) - v_cost_before
    );

    EXIT WHEN v_estimated_cost >= p_amount;
    v_high := v_high * 2;
  END LOOP;

  -- 이진탐색: low ~ high 사이에서 80회 반복으로 정밀화
  FOR v_i IN 1..80 LOOP
    v_mid := (v_low + v_high) / 2;

    v_new_q_home := v_market.q_home;
    v_new_q_away := v_market.q_away;
    v_new_q_draw := v_market.q_draw;

    CASE v_outcome
      WHEN 'HOME' THEN v_new_q_home := v_new_q_home + v_mid;
      WHEN 'AWAY' THEN v_new_q_away := v_new_q_away + v_mid;
      WHEN 'DRAW' THEN v_new_q_draw := v_new_q_draw + v_mid;
    END CASE;

    v_estimated_cost := 100 * (
      public.lmsr_cost(v_new_q_home, v_new_q_away, v_new_q_draw, v_market.b) - v_cost_before
    );

    IF v_estimated_cost <= p_amount THEN
      v_low := v_mid;
    ELSE
      v_high := v_mid;
    END IF;
  END LOOP;

  v_quantity := TRUNC(v_low, 8);

  IF v_quantity <= 0 THEN
    RAISE EXCEPTION '입력한 금액으로는 매수할 수 없습니다';
  END IF;

  SELECT public.execute_buy_order(p_user_id, p_market_id, v_outcome, v_quantity)
  INTO v_result;

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C4. settle_market: 시즌 인지 정산
CREATE OR REPLACE FUNCTION public.settle_market(
  p_market_id INTEGER,
  p_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result TEXT;
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
  v_user_payout RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_new_balance NUMERIC;
  v_total_users_settled INTEGER := 0;
  v_total_coins_distributed NUMERIC := 0;
BEGIN
  v_result := UPPER(BTRIM(COALESCE(p_result, '')));

  IF v_result NOT IN ('HOME', 'AWAY', 'DRAW') THEN
    RAISE EXCEPTION '정산 결과는 HOME, AWAY, DRAW 중 하나여야 합니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status = 'SETTLED' THEN
    RAISE EXCEPTION '이미 정산된 마켓입니다';
  END IF;

  IF v_market.status = 'CANCELED' THEN
    RAISE EXCEPTION '취소된 마켓은 정산할 수 없습니다';
  END IF;

  -- 시즌 hard-block: 마켓 시즌이 현재 ACTIVE 시즌이 아니면 정산 차단
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '시즌이 활성 상태가 아니어서 정산할 수 없습니다 (마켓 시즌: %, 현재 활성 시즌: %)',
      v_market.season_id, v_active_season_id;
  END IF;

  UPDATE public.markets
  SET
    status = 'SETTLED',
    result = v_result,
    updated_at = NOW()
  WHERE id = p_market_id;

  FOR v_user_payout IN
    SELECT
      p.user_id,
      COALESCE(SUM(
        CASE
          WHEN p.outcome = v_result THEN p.quantity * 100
          ELSE 0
        END
      ), 0) AS payout
    FROM public.positions p
    WHERE p.market_id = p_market_id
      AND p.quantity > 0
    GROUP BY p.user_id
  LOOP
    -- 시즌 인지 지갑 잠금 (마켓 시즌과 동일한 시즌의 지갑만 사용)
    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_payout.user_id
      AND season_id = v_market.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
      -- 거래가 발생했다면 지갑은 반드시 있어야 함. 방어적으로 RAISE.
      RAISE EXCEPTION '정산 대상 사용자의 지갑을 찾을 수 없습니다 (user_id: %, season_id: %)',
        v_user_payout.user_id, v_market.season_id;
    END IF;

    v_new_balance := v_wallet.balance + v_user_payout.payout;

    UPDATE public.wallets
    SET
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO public.transactions (
      user_id, type, amount, balance_after, reference_id, description, season_id
    )
    VALUES (
      v_user_payout.user_id,
      'SETTLEMENT',
      v_user_payout.payout,
      v_new_balance,
      p_market_id,
      '마켓 정산 - ' || v_result,
      v_market.season_id
    );

    v_total_users_settled := v_total_users_settled + 1;
    v_total_coins_distributed := v_total_coins_distributed + v_user_payout.payout;
  END LOOP;

  -- 정산된 마켓의 포지션을 모두 0 으로 클로즈
  UPDATE public.positions
  SET
    quantity = 0,
    avg_entry_price = 0,
    updated_at = NOW()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'total_users_settled', v_total_users_settled,
    'total_coins_distributed', v_total_coins_distributed
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C5. cancel_market: 시즌 인지 취소 + 원가 환급
CREATE OR REPLACE FUNCTION public.cancel_market(
  p_market_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
  v_refund_row RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_new_balance NUMERIC;
  v_total_users_refunded INTEGER := 0;
  v_total_refunded NUMERIC := 0;
BEGIN
  IF p_market_id IS NULL OR p_market_id <= 0 THEN
    RAISE EXCEPTION '마켓 정보가 올바르지 않습니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status = 'SETTLED' THEN
    RAISE EXCEPTION '이미 정산된 마켓은 취소할 수 없습니다';
  END IF;

  IF v_market.status = 'CANCELED' THEN
    RAISE EXCEPTION '이미 취소된 마켓입니다';
  END IF;

  -- 시즌 검증
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '시즌이 활성 상태가 아니어서 정산할 수 없습니다 (마켓 시즌: %, 현재 활성 시즌: %)',
      v_market.season_id, v_active_season_id;
  END IF;

  UPDATE public.markets
  SET
    status = 'CANCELED',
    result = NULL,
    updated_at = NOW()
  WHERE id = p_market_id;

  FOR v_refund_row IN
    SELECT
      p.user_id,
      COALESCE(SUM(p.quantity * p.avg_entry_price), 0) AS refund_amount
    FROM public.positions p
    WHERE p.market_id = p_market_id
      AND p.quantity > 0
    GROUP BY p.user_id
    HAVING COALESCE(SUM(p.quantity * p.avg_entry_price), 0) > 0
  LOOP
    -- 시즌 인지 지갑 잠금
    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_refund_row.user_id
      AND season_id = v_market.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '환급 대상 사용자의 지갑을 찾을 수 없습니다 (user_id: %, season_id: %)',
        v_refund_row.user_id, v_market.season_id;
    END IF;

    v_new_balance := v_wallet.balance + v_refund_row.refund_amount;

    UPDATE public.wallets
    SET
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO public.transactions (
      user_id, type, amount, balance_after, reference_id, description, season_id
    )
    VALUES (
      v_refund_row.user_id,
      'SETTLEMENT',
      v_refund_row.refund_amount,
      v_new_balance,
      p_market_id,
      '마켓 취소 원가 환급',
      v_market.season_id
    );

    v_total_users_refunded := v_total_users_refunded + 1;
    v_total_refunded := v_total_refunded + v_refund_row.refund_amount;
  END LOOP;

  UPDATE public.positions
  SET
    quantity = 0,
    avg_entry_price = 0,
    updated_at = NOW()
  WHERE market_id = p_market_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'market_id', p_market_id,
    'status', 'CANCELED',
    'total_users_refunded', v_total_users_refunded,
    'total_refunded', v_total_refunded
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C6. close_market: OPEN → CLOSED (시즌 검증만 추가)
CREATE OR REPLACE FUNCTION public.close_market(
  p_market_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_active_season_id INTEGER;
BEGIN
  IF p_market_id IS NULL OR p_market_id <= 0 THEN
    RAISE EXCEPTION '마켓 정보가 올바르지 않습니다';
  END IF;

  SELECT *
  INTO v_market
  FROM public.markets
  WHERE id = p_market_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  IF v_market.status = 'SETTLED' THEN
    RAISE EXCEPTION '이미 정산된 마켓은 종료할 수 없습니다';
  END IF;

  IF v_market.status = 'CANCELED' THEN
    RAISE EXCEPTION '취소된 마켓은 종료할 수 없습니다';
  END IF;

  -- 시즌 검증 (방어적: 과거 시즌 마켓을 close 하지 않도록)
  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  IF v_market.season_id <> v_active_season_id THEN
    RAISE EXCEPTION '시즌이 활성 상태가 아니어서 정산할 수 없습니다 (마켓 시즌: %, 현재 활성 시즌: %)',
      v_market.season_id, v_active_season_id;
  END IF;

  IF v_market.status <> 'CLOSED' THEN
    UPDATE public.markets
    SET
      status = 'CLOSED',
      updated_at = NOW()
    WHERE id = p_market_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'market_id', p_market_id,
    'status', 'CLOSED'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- C7. create_market: 활성 시즌으로 마켓 생성
CREATE OR REPLACE FUNCTION public.create_market(
  p_game_id INTEGER,
  p_initial_home NUMERIC DEFAULT 47.5,
  p_initial_away NUMERIC DEFAULT 47.5,
  p_initial_draw NUMERIC DEFAULT 5.0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_active_season_id INTEGER;
  v_b NUMERIC;
  v_total_probability NUMERIC;
  v_market_id INTEGER;
BEGIN
  IF p_game_id IS NULL THEN
    RAISE EXCEPTION '경기 정보가 올바르지 않습니다';
  END IF;

  IF p_initial_home <= 0 OR p_initial_away <= 0 OR p_initial_draw <= 0 THEN
    RAISE EXCEPTION '초기 확률은 모두 0보다 커야 합니다';
  END IF;

  v_total_probability := p_initial_home + p_initial_away + p_initial_draw;

  IF ABS(v_total_probability - 100) > 0.000001 THEN
    RAISE EXCEPTION '초기 확률의 합은 100이어야 합니다';
  END IF;

  SELECT id INTO v_active_season_id
  FROM public.seasons
  WHERE status = 'ACTIVE'
  LIMIT 1;

  IF v_active_season_id IS NULL THEN
    RAISE EXCEPTION '활성 시즌이 없습니다';
  END IF;

  SELECT (value ->> 'value')::NUMERIC
  INTO v_b
  FROM public.settings
  WHERE key = 'liquidity_b'
  LIMIT 1;

  IF v_b IS NULL OR v_b <= 0 THEN
    RAISE EXCEPTION '유효한 유동성 파라미터(b)를 찾을 수 없습니다';
  END IF;

  INSERT INTO public.markets (
    game_id, q_home, q_away, q_draw, b, status, result,
    initial_home_price, initial_away_price, initial_draw_price,
    season_id
  )
  VALUES (
    p_game_id,
    v_b * LN(p_initial_home),
    v_b * LN(p_initial_away),
    v_b * LN(p_initial_draw),
    v_b,
    'OPEN',
    NULL,
    p_initial_home,
    p_initial_away,
    p_initial_draw,
    v_active_season_id
  )
  RETURNING id INTO v_market_id;

  RETURN v_market_id;
END;
$$;


-- ============================================================================
-- SECTION D: 리더보드 / 히스토리 RPC 업데이트
-- ============================================================================

-- D1. get_leaderboard_balance: 시즌별 잔고 랭킹 (JSONB)
DROP FUNCTION IF EXISTS public.get_leaderboard_balance();
CREATE OR REPLACE FUNCTION public.get_leaderboard_balance(
  p_season_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season_id INTEGER;
  v_ranks JSONB;
BEGIN
  IF p_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM public.seasons
    WHERE status = 'ACTIVE'
    LIMIT 1;

    IF v_season_id IS NULL THEN
      RAISE EXCEPTION '활성 시즌이 없습니다';
    END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.position_rank,
        'user_id', r.user_id,
        'username', r.username,
        'balance', r.balance
      )
      ORDER BY r.position_rank, r.username, r.user_id
    ),
    '[]'::JSONB
  )
  INTO v_ranks
  FROM (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY
          w.balance DESC,
          u.username ASC,
          u.id ASC
      )::BIGINT AS position_rank,
      u.id AS user_id,
      u.username::TEXT AS username,
      w.balance
    FROM public.wallets w
    JOIN public.users u ON u.id = w.user_id
    WHERE w.season_id = v_season_id
  ) r;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season_id', v_season_id,
    'ranks', v_ranks
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- D2. get_leaderboard_roi: 시즌별 ROI 랭킹 (JSONB)
DROP FUNCTION IF EXISTS public.get_leaderboard_roi();
CREATE OR REPLACE FUNCTION public.get_leaderboard_roi(
  p_season_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season_id INTEGER;
  v_ranks JSONB;
BEGIN
  IF p_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM public.seasons
    WHERE status = 'ACTIVE'
    LIMIT 1;

    IF v_season_id IS NULL THEN
      RAISE EXCEPTION '활성 시즌이 없습니다';
    END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'rank', r.position_rank,
        'user_id', r.user_id,
        'username', r.username,
        'roi_percent', r.roi_percent,
        'current_balance', r.current_balance,
        'total_granted', r.total_granted
      )
      ORDER BY r.position_rank, r.username, r.user_id
    ),
    '[]'::JSONB
  )
  INTO v_ranks
  FROM (
    SELECT
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN g.total_granted > 0 THEN
            ((COALESCE(w.balance, 0) - g.total_granted) / g.total_granted) * 100
          ELSE 0
          END DESC,
          COALESCE(w.balance, 0) DESC,
          u.username ASC,
          u.id ASC
      )::BIGINT AS position_rank,
      u.id AS user_id,
      u.username::TEXT AS username,
      CASE WHEN g.total_granted > 0 THEN
        ((COALESCE(w.balance, 0) - g.total_granted) / g.total_granted) * 100
      ELSE 0
      END AS roi_percent,
      COALESCE(w.balance, 0) AS current_balance,
      g.total_granted
    FROM public.users u
    LEFT JOIN public.wallets w
      ON w.user_id = u.id AND w.season_id = v_season_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(t.amount), 0) AS total_granted
      FROM public.transactions t
      WHERE t.user_id = u.id
        AND t.season_id = v_season_id
        AND t.type IN ('SEASON_GRANT', 'WEEKLY_GRANT', 'ADMIN_GRANT')
    ) g ON TRUE
    -- 해당 시즌에 grant 가 한 푼도 없는 사용자는 ROI 계산이 의미 없으므로 제외
    WHERE g.total_granted > 0
  ) r;

  RETURN jsonb_build_object(
    'success', TRUE,
    'season_id', v_season_id,
    'ranks', v_ranks
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;


-- D3. get_user_open_positions: 시즌별 진행 포지션 조회
DROP FUNCTION IF EXISTS public.get_user_open_positions(UUID);
DROP FUNCTION IF EXISTS public.get_user_open_positions(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_user_open_positions(
  p_user_id UUID,
  p_season_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
  market_id INTEGER,
  outcome TEXT,
  quantity NUMERIC,
  avg_entry_price NUMERIC,
  season_id INTEGER,
  season_name TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_season_id INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_season_id IS NULL THEN
    SELECT id INTO v_season_id
    FROM public.seasons
    WHERE status = 'ACTIVE'
    LIMIT 1;

    IF v_season_id IS NULL THEN
      RAISE EXCEPTION '활성 시즌이 없습니다';
    END IF;
  ELSE
    v_season_id := p_season_id;
  END IF;

  RETURN QUERY
  SELECT
    p.market_id,
    p.outcome::TEXT,
    p.quantity,
    p.avg_entry_price,
    p.season_id,
    s.name::TEXT AS season_name,
    p.updated_at
  FROM public.positions p
  JOIN public.seasons s ON s.id = p.season_id
  WHERE p.user_id = p_user_id
    AND p.season_id = v_season_id
    AND p.quantity > 0
  ORDER BY p.updated_at DESC, p.market_id DESC;
END;
$$;


-- D4. get_user_orders_by_date: 시즌 옵션 + 시즌명 포함
DROP FUNCTION IF EXISTS public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
CREATE OR REPLACE FUNCTION public.get_user_orders_by_date(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_season_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
  order_id INTEGER,
  market_id INTEGER,
  outcome TEXT,
  side TEXT,
  quantity NUMERIC,
  total_cost NUMERIC,
  avg_price NUMERIC,
  season_id INTEGER,
  season_name TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at >= p_end_at THEN
    RAISE EXCEPTION '조회 기간이 올바르지 않습니다';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.market_id,
    o.outcome::TEXT,
    o.side::TEXT,
    o.quantity,
    o.total_cost,
    o.avg_price,
    o.season_id,
    s.name::TEXT AS season_name,
    o.created_at
  FROM public.orders o
  JOIN public.seasons s ON s.id = o.season_id
  WHERE o.user_id = p_user_id
    AND o.created_at >= p_start_at
    AND o.created_at < p_end_at
    AND (p_season_id IS NULL OR o.season_id = p_season_id)
  ORDER BY o.created_at DESC, o.id DESC;
END;
$$;


-- D5. get_user_settlement_history: 시즌 옵션 + 시즌명 포함
DROP FUNCTION IF EXISTS public.get_user_settlement_history(UUID);
DROP FUNCTION IF EXISTS public.get_user_settlement_history(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_user_settlement_history(
  p_user_id UUID,
  p_season_id INTEGER DEFAULT NULL
)
RETURNS TABLE(
  market_id INTEGER,
  settled_at TIMESTAMPTZ,
  settlement_amount NUMERIC,
  net_invested NUMERIC,
  final_pnl NUMERIC,
  home_quantity NUMERIC,
  away_quantity NUMERIC,
  draw_quantity NUMERIC,
  season_id INTEGER,
  season_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  RETURN QUERY
  WITH settlement_transactions AS (
    SELECT
      t.reference_id AS market_id,
      MAX(t.created_at) AS settled_at,
      COALESCE(SUM(t.amount), 0) AS settlement_amount,
      MAX(t.season_id) AS season_id
    FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'SETTLEMENT'
      AND t.reference_id IS NOT NULL
      AND (p_season_id IS NULL OR t.season_id = p_season_id)
    GROUP BY t.reference_id
  ),
  order_aggregates AS (
    SELECT
      o.market_id,
      COALESCE(
        SUM(
          CASE
            WHEN o.side = 'BUY' THEN o.total_cost
            WHEN o.side = 'SELL' THEN -o.total_cost
            ELSE 0
          END
        ),
        0
      ) AS net_invested,
      COALESCE(
        SUM(
          CASE
            WHEN o.outcome = 'HOME' AND o.side = 'BUY' THEN o.quantity
            WHEN o.outcome = 'HOME' AND o.side = 'SELL' THEN -o.quantity
            ELSE 0
          END
        ),
        0
      ) AS home_quantity,
      COALESCE(
        SUM(
          CASE
            WHEN o.outcome = 'AWAY' AND o.side = 'BUY' THEN o.quantity
            WHEN o.outcome = 'AWAY' AND o.side = 'SELL' THEN -o.quantity
            ELSE 0
          END
        ),
        0
      ) AS away_quantity,
      COALESCE(
        SUM(
          CASE
            WHEN o.outcome = 'DRAW' AND o.side = 'BUY' THEN o.quantity
            WHEN o.outcome = 'DRAW' AND o.side = 'SELL' THEN -o.quantity
            ELSE 0
          END
        ),
        0
      ) AS draw_quantity
    FROM public.orders o
    WHERE o.user_id = p_user_id
      AND (p_season_id IS NULL OR o.season_id = p_season_id)
    GROUP BY o.market_id
  )
  SELECT
    st.market_id,
    st.settled_at,
    st.settlement_amount,
    COALESCE(a.net_invested, 0) AS net_invested,
    st.settlement_amount - COALESCE(a.net_invested, 0) AS final_pnl,
    COALESCE(a.home_quantity, 0) AS home_quantity,
    COALESCE(a.away_quantity, 0) AS away_quantity,
    COALESCE(a.draw_quantity, 0) AS draw_quantity,
    st.season_id,
    s.name::TEXT AS season_name
  FROM settlement_transactions st
  LEFT JOIN order_aggregates a
    ON a.market_id = st.market_id
  LEFT JOIN public.seasons s
    ON s.id = st.season_id
  ORDER BY st.settled_at DESC, st.market_id DESC;
END;
$$;


-- D6. get_market_detail: 마켓 + 시즌 + 경기 + 가격 통합 상세 조회
CREATE OR REPLACE FUNCTION public.get_market_detail(
  p_market_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_detail RECORD;
  v_prices JSONB;
BEGIN
  SELECT
    m.id AS market_id,
    m.game_id,
    m.q_home,
    m.q_away,
    m.q_draw,
    m.b,
    m.status,
    m.result,
    m.initial_home_price,
    m.initial_away_price,
    m.initial_draw_price,
    m.created_at AS market_created_at,
    m.updated_at AS market_updated_at,
    m.season_id,
    s.name AS season_name,
    g.id AS game_id_value,
    g.game_date,
    g.game_time,
    g.game_status,
    g.home_pitcher,
    g.away_pitcher,
    g.home_score,
    g.away_score,
    ht.id AS home_team_id,
    ht.name AS home_team_name,
    ht.short_name AS home_team_short_name,
    at.id AS away_team_id,
    at.name AS away_team_name,
    at.short_name AS away_team_short_name
  INTO v_detail
  FROM public.markets m
  JOIN public.games g ON g.id = m.game_id
  JOIN public.teams ht ON ht.id = g.home_team_id
  JOIN public.teams at ON at.id = g.away_team_id
  LEFT JOIN public.seasons s ON s.id = m.season_id
  WHERE m.id = p_market_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'outcome', p.outcome,
        'price', p.price
      )
      ORDER BY CASE p.outcome
        WHEN 'HOME' THEN 1
        WHEN 'AWAY' THEN 2
        ELSE 3
      END
    ),
    '[]'::JSONB
  )
  INTO v_prices
  FROM public.lmsr_prices(p_market_id) p;

  RETURN jsonb_build_object(
    'market', jsonb_build_object(
      'id', v_detail.market_id,
      'game_id', v_detail.game_id,
      'q_home', v_detail.q_home,
      'q_away', v_detail.q_away,
      'q_draw', v_detail.q_draw,
      'b', v_detail.b,
      'status', v_detail.status,
      'result', v_detail.result,
      'initial_home_price', v_detail.initial_home_price,
      'initial_away_price', v_detail.initial_away_price,
      'initial_draw_price', v_detail.initial_draw_price,
      'created_at', v_detail.market_created_at,
      'updated_at', v_detail.market_updated_at,
      'season_id', v_detail.season_id,
      'season_name', v_detail.season_name
    ),
    'prices', v_prices,
    'game', jsonb_build_object(
      'id', v_detail.game_id_value,
      'game_date', v_detail.game_date,
      'game_time', v_detail.game_time,
      'game_status', v_detail.game_status,
      'home_pitcher', v_detail.home_pitcher,
      'away_pitcher', v_detail.away_pitcher,
      'home_score', v_detail.home_score,
      'away_score', v_detail.away_score,
      'home_team', jsonb_build_object(
        'id', v_detail.home_team_id,
        'name', v_detail.home_team_name,
        'short_name', v_detail.home_team_short_name
      ),
      'away_team', jsonb_build_object(
        'id', v_detail.away_team_id,
        'name', v_detail.away_team_name,
        'short_name', v_detail.away_team_short_name
      )
    )
  );
END;
$$;


-- ============================================================================
-- SECTION E: GRANT + pg_cron 검증
-- ============================================================================

-- E1. anon/authenticated 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.get_active_season() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_seasons() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_season(TEXT, DATE, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_season(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_season(INTEGER) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.login(BIGINT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_weekly_coins(NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_coins(UUID, NUMERIC) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.execute_buy_order(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sell_order(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_buy_by_amount(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_market(INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_market(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_market(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_market(INTEGER, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_detail(INTEGER) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_balance(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_roi(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_open_positions(UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_settlement_history(UUID, INTEGER) TO anon, authenticated;


-- E2. pg_cron weekly_coin_distribution 작업 상태 진단 (NOTICE only, non-fatal)
DO $$
DECLARE
  v_has_pg_cron BOOLEAN := FALSE;
  v_job_command TEXT;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  )
  INTO v_has_pg_cron;

  IF NOT v_has_pg_cron THEN
    RAISE NOTICE 'pg_cron 확장이 비활성화되어 있어 weekly_coin_distribution 작업 검증을 건너뜁니다 (staging 환경일 수 있음).';
    RETURN;
  END IF;

  BEGIN
    EXECUTE
      'SELECT command FROM cron.job WHERE jobname = ''weekly_coin_distribution'' LIMIT 1'
    INTO v_job_command;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'cron.job 조회 권한이 없어 weekly_coin_distribution 작업 검증을 건너뜁니다: %', SQLERRM;
      RETURN;
  END;

  IF v_job_command IS NULL THEN
    RAISE NOTICE 'weekly_coin_distribution 작업이 cron.job 에 등록되어 있지 않습니다. 필요 시 수동 등록이 필요합니다.';
  ELSE
    RAISE NOTICE 'weekly_coin_distribution 작업이 존재합니다 (command: %). distribute_weekly_coins 시그니처가 유지되어 추가 작업 불필요.', v_job_command;
  END IF;
END $$;


DO $$
BEGIN
  RAISE NOTICE 'US-012 Wave 2 RPC migration applied: 22 season-aware functions';
END $$;

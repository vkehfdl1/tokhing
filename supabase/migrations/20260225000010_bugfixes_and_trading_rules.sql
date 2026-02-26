-- 버그픽스 및 거래 규칙 마이그레이션
-- 1. RLS 비활성화 (학번 로그인에서 auth.uid() NULL 문제)
-- 2. positions.purchased_at 컬럼 추가
-- 3. execute_buy_order에 폐장 시간 + purchased_at 업데이트
-- 4. execute_sell_order에 폐장 시간 + 30분 쿨다운 체크
-- 5. get_market_positions에 purchased_at 반환 추가

-- ============================================================
-- 1) RLS 비활성화 (wallets, positions, orders, transactions)
-- ============================================================
ALTER TABLE public.wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2) positions 테이블에 purchased_at 컬럼 추가
-- ============================================================
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================
-- 3) get_market_positions: purchased_at 반환 추가
--    리턴 타입 변경이므로 DROP 후 재생성 필요
-- ============================================================
DROP FUNCTION IF EXISTS public.get_market_positions(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_market_positions(
  p_user_id UUID,
  p_market_id INTEGER
)
RETURNS TABLE(
  outcome TEXT,
  quantity NUMERIC,
  avg_entry_price NUMERIC,
  purchased_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_market_id IS NULL THEN
    RAISE EXCEPTION '마켓 정보가 올바르지 않습니다';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.markets WHERE id = p_market_id) THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    p.outcome::TEXT,
    p.quantity,
    p.avg_entry_price,
    p.purchased_at
  FROM public.positions p
  WHERE p.user_id = p_user_id
    AND p.market_id = p_market_id
    AND p.quantity > 0
  ORDER BY CASE p.outcome
    WHEN 'HOME' THEN 1
    WHEN 'AWAY' THEN 2
    ELSE 3
  END;
END;
$$;

-- ============================================================
-- 4) execute_buy_order: 폐장 시간 체크 + purchased_at 업데이트
-- ============================================================
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

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
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
      user_id,
      market_id,
      outcome,
      quantity,
      avg_entry_price,
      purchased_at,
      updated_at
    )
    VALUES (
      p_user_id,
      p_market_id,
      v_outcome,
      p_quantity,
      v_avg_price,
      NOW(),
      NOW()
    );
  END IF;

  INSERT INTO public.orders (
    user_id,
    market_id,
    outcome,
    side,
    quantity,
    total_cost,
    avg_price
  )
  VALUES (
    p_user_id,
    p_market_id,
    v_outcome,
    'BUY',
    p_quantity,
    v_total_cost,
    v_avg_price
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    balance_after,
    reference_id,
    description
  )
  VALUES (
    p_user_id,
    'BUY',
    -v_total_cost,
    v_new_balance,
    v_order_id,
    '매수 주문 체결'
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

-- ============================================================
-- 5) execute_sell_order: 폐장 시간 체크 + 30분 쿨다운
-- ============================================================
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

  -- 30분 매도 쿨다운 체크 (KST 기준)
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

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
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
    user_id,
    market_id,
    outcome,
    side,
    quantity,
    total_cost,
    avg_price
  )
  VALUES (
    p_user_id,
    p_market_id,
    v_outcome,
    'SELL',
    p_quantity,
    v_total_refund,
    v_avg_price
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    balance_after,
    reference_id,
    description
  )
  VALUES (
    p_user_id,
    'SELL',
    v_total_refund,
    v_new_balance,
    v_order_id,
    '매도 주문 체결'
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

-- ============================================================
-- 6) execute_buy_by_amount: 폐장 시간 체크 추가
-- ============================================================
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

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '지갑 정보를 찾을 수 없습니다';
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION '잔고가 부족합니다';
  END IF;

  v_cost_before := public.lmsr_cost(v_market.q_home, v_market.q_away, v_market.q_draw, v_market.b);

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

-- ============================================================
-- 7) DROP 후 재생성된 get_market_positions에 대한 GRANT 복원
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_market_positions(UUID, INTEGER) TO anon, authenticated;

-- ============================================================
-- 8) VARCHAR→TEXT 타입 불일치 수정
--    positions.outcome, orders.outcome, orders.side 컬럼은 VARCHAR인데
--    RPC RETURNS TABLE에서 TEXT로 선언하여 42804 에러 발생
--    → SELECT에서 ::TEXT 캐스트 추가
-- ============================================================

-- 8-a) get_market_positions: outcome VARCHAR → TEXT 캐스트
DROP FUNCTION IF EXISTS public.get_market_positions(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_market_positions(
  p_user_id UUID,
  p_market_id INTEGER
)
RETURNS TABLE(
  outcome TEXT,
  quantity NUMERIC,
  avg_entry_price NUMERIC,
  purchased_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF p_market_id IS NULL THEN
    RAISE EXCEPTION '마켓 정보가 올바르지 않습니다';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.markets WHERE id = p_market_id) THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    p.outcome::TEXT,
    p.quantity,
    p.avg_entry_price,
    p.purchased_at
  FROM public.positions p
  WHERE p.user_id = p_user_id
    AND p.market_id = p_market_id
    AND p.quantity > 0
  ORDER BY CASE p.outcome
    WHEN 'HOME' THEN 1
    WHEN 'AWAY' THEN 2
    ELSE 3
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_market_positions(UUID, INTEGER) TO anon, authenticated;

-- 8-b) get_user_open_positions: outcome VARCHAR → TEXT 캐스트
DROP FUNCTION IF EXISTS public.get_user_open_positions(UUID);
CREATE OR REPLACE FUNCTION public.get_user_open_positions(
  p_user_id UUID
)
RETURNS TABLE(
  market_id INTEGER,
  outcome TEXT,
  quantity NUMERIC,
  avg_entry_price NUMERIC,
  updated_at TIMESTAMPTZ
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
  SELECT
    p.market_id,
    p.outcome::TEXT,
    p.quantity,
    p.avg_entry_price,
    p.updated_at
  FROM public.positions p
  WHERE p.user_id = p_user_id
    AND p.quantity > 0
  ORDER BY p.updated_at DESC, p.market_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_open_positions(UUID) TO anon, authenticated;

-- 8-c) get_user_orders_by_date: outcome/side VARCHAR → TEXT 캐스트
DROP FUNCTION IF EXISTS public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.get_user_orders_by_date(
  p_user_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS TABLE(
  order_id INTEGER,
  market_id INTEGER,
  outcome TEXT,
  side TEXT,
  quantity NUMERIC,
  total_cost NUMERIC,
  avg_price NUMERIC,
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
    o.created_at
  FROM public.orders o
  WHERE o.user_id = p_user_id
    AND o.created_at >= p_start_at
    AND o.created_at < p_end_at
  ORDER BY o.created_at DESC, o.id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

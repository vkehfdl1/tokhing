-- US-003: LMSR 엔진 RPC 함수
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

-- REQ-019
CREATE OR REPLACE FUNCTION public.lmsr_cost(
  q_home NUMERIC,
  q_away NUMERIC,
  q_draw NUMERIC,
  b NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_max_q NUMERIC;
BEGIN
  IF q_home IS NULL OR q_away IS NULL OR q_draw IS NULL THEN
    RAISE EXCEPTION 'q 값은 NULL일 수 없습니다';
  END IF;

  IF b IS NULL OR b <= 0 THEN
    RAISE EXCEPTION '유동성 파라미터(b)는 0보다 커야 합니다';
  END IF;

  v_max_q := GREATEST(q_home, q_away, q_draw);

  RETURN v_max_q + b * LN(
    EXP((q_home - v_max_q) / b) +
    EXP((q_away - v_max_q) / b) +
    EXP((q_draw - v_max_q) / b)
  );
END;
$$;

-- REQ-020
CREATE OR REPLACE FUNCTION public.lmsr_prices(
  p_market_id INTEGER
)
RETURNS TABLE(outcome TEXT, price NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q_home NUMERIC;
  v_q_away NUMERIC;
  v_q_draw NUMERIC;
  v_b NUMERIC;
  v_max_q NUMERIC;
  v_e_home NUMERIC;
  v_e_away NUMERIC;
  v_e_draw NUMERIC;
  v_denominator NUMERIC;
BEGIN
  SELECT q_home, q_away, q_draw, b
  INTO v_q_home, v_q_away, v_q_draw, v_b
  FROM public.markets
  WHERE id = p_market_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  v_max_q := GREATEST(v_q_home, v_q_away, v_q_draw);
  v_e_home := EXP((v_q_home - v_max_q) / v_b);
  v_e_away := EXP((v_q_away - v_max_q) / v_b);
  v_e_draw := EXP((v_q_draw - v_max_q) / v_b);
  v_denominator := v_e_home + v_e_away + v_e_draw;

  RETURN QUERY
  SELECT 'HOME'::TEXT, 100 * v_e_home / v_denominator
  UNION ALL
  SELECT 'AWAY'::TEXT, 100 * v_e_away / v_denominator
  UNION ALL
  SELECT 'DRAW'::TEXT, 100 * v_e_draw / v_denominator;
END;
$$;

-- REQ-021
CREATE OR REPLACE FUNCTION public.execute_buy_order(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      updated_at = NOW()
    WHERE id = v_position.id;
  ELSE
    INSERT INTO public.positions (
      user_id,
      market_id,
      outcome,
      quantity,
      avg_entry_price,
      updated_at
    )
    VALUES (
      p_user_id,
      p_market_id,
      v_outcome,
      p_quantity,
      v_avg_price,
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

-- REQ-022
CREATE OR REPLACE FUNCTION public.execute_sell_order(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- REQ-023
CREATE OR REPLACE FUNCTION public.execute_buy_by_amount(
  p_user_id UUID,
  p_market_id INTEGER,
  p_outcome TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- REQ-024
CREATE OR REPLACE FUNCTION public.settle_market(
  p_market_id INTEGER,
  p_result TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_market public.markets%ROWTYPE;
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
    GROUP BY p.user_id
  LOOP
    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_payout.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance)
      VALUES (v_user_payout.user_id, 0)
      RETURNING * INTO v_wallet;
    END IF;

    v_new_balance := v_wallet.balance + v_user_payout.payout;

    UPDATE public.wallets
    SET
      balance = v_new_balance,
      updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO public.transactions (
      user_id,
      type,
      amount,
      balance_after,
      reference_id,
      description
    )
    VALUES (
      v_user_payout.user_id,
      'SETTLEMENT',
      v_user_payout.payout,
      v_new_balance,
      p_market_id,
      '마켓 정산'
    );

    v_total_users_settled := v_total_users_settled + 1;
    v_total_coins_distributed := v_total_coins_distributed + v_user_payout.payout;
  END LOOP;

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

-- REQ-025
CREATE OR REPLACE FUNCTION public.create_market(
  p_game_id INTEGER,
  p_initial_home NUMERIC DEFAULT 47.5,
  p_initial_away NUMERIC DEFAULT 47.5,
  p_initial_draw NUMERIC DEFAULT 5.0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

  SELECT (value ->> 'value')::NUMERIC
  INTO v_b
  FROM public.settings
  WHERE key = 'liquidity_b'
  LIMIT 1;

  IF v_b IS NULL OR v_b <= 0 THEN
    RAISE EXCEPTION '유효한 유동성 파라미터(b)를 찾을 수 없습니다';
  END IF;

  INSERT INTO public.markets (
    game_id,
    q_home,
    q_away,
    q_draw,
    b,
    status,
    result,
    initial_home_price,
    initial_away_price,
    initial_draw_price
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
    p_initial_draw
  )
  RETURNING id INTO v_market_id;

  RETURN v_market_id;
END;
$$;

-- REQ-026
CREATE OR REPLACE FUNCTION public.get_market_detail(
  p_market_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      'updated_at', v_detail.market_updated_at
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

GRANT EXECUTE ON FUNCTION public.lmsr_cost(NUMERIC, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lmsr_prices(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_buy_order(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_sell_order(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_buy_by_amount(UUID, INTEGER, TEXT, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_market(INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_market(INTEGER, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_detail(INTEGER) TO anon, authenticated;

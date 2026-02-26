-- US-009: Admin 패널 - 마켓 관리, 정산, 설정
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

-- REQ-059: 전역 유동성(b값) 설정
CREATE OR REPLACE FUNCTION public.set_liquidity_b(
  p_b NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_previous_b NUMERIC;
BEGIN
  IF p_b IS NULL OR p_b <= 0 THEN
    RAISE EXCEPTION '유동성 파라미터(b)는 0보다 커야 합니다';
  END IF;

  SELECT (value ->> 'value')::NUMERIC
  INTO v_previous_b
  FROM public.settings
  WHERE key = 'liquidity_b'
  LIMIT 1;

  INSERT INTO public.settings (key, value, updated_at)
  VALUES ('liquidity_b', jsonb_build_object('value', p_b), NOW())
  ON CONFLICT (key)
  DO UPDATE
  SET
    value = EXCLUDED.value,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', TRUE,
    'previous_b', COALESCE(v_previous_b, p_b),
    'current_b', p_b
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

-- REQ-061: 마켓 강제 종료(CLOSED)
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

-- REQ-061: 마켓 취소(CANCELED) + 투자 원가 환급
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
    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_refund_row.user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance)
      VALUES (v_refund_row.user_id, 0)
      RETURNING * INTO v_wallet;
    END IF;

    v_new_balance := v_wallet.balance + v_refund_row.refund_amount;

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
      v_refund_row.user_id,
      'SETTLEMENT',
      v_refund_row.refund_amount,
      v_new_balance,
      p_market_id,
      '마켓 취소 원가 환급'
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

-- REQ-060: pg_cron 상태(마지막 자동 지급 시각) 조회
CREATE OR REPLACE FUNCTION public.get_weekly_coin_cron_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_has_pg_cron BOOLEAN := FALSE;
  v_job_name TEXT := 'weekly_coin_distribution';
  v_last_run_at TIMESTAMPTZ;
  v_last_status TEXT;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  )
  INTO v_has_pg_cron;

  IF NOT v_has_pg_cron THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'cron_enabled', FALSE,
      'job_name', v_job_name,
      'last_run_at', NULL,
      'last_status', NULL,
      'message', 'pg_cron 확장이 비활성화되어 있습니다'
    );
  END IF;

  BEGIN
    EXECUTE $CRON$
      SELECT
        j.jobname,
        d.end_time,
        d.status
      FROM cron.job j
      LEFT JOIN LATERAL (
        SELECT
          end_time,
          status
        FROM cron.job_run_details
        WHERE jobid = j.jobid
        ORDER BY end_time DESC NULLS LAST
        LIMIT 1
      ) d ON TRUE
      WHERE j.jobname = 'weekly_coin_distribution'
      LIMIT 1
    $CRON$
    INTO v_job_name, v_last_run_at, v_last_status;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object(
        'success', TRUE,
        'cron_enabled', TRUE,
        'job_name', 'weekly_coin_distribution',
        'last_run_at', NULL,
        'last_status', NULL,
        'message', 'cron 상태 조회 권한이 없어 마지막 실행 시각을 확인할 수 없습니다'
      );
  END;

  IF v_job_name IS NULL THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'cron_enabled', TRUE,
      'job_name', 'weekly_coin_distribution',
      'last_run_at', NULL,
      'last_status', NULL,
      'message', 'weekly_coin_distribution 작업이 등록되어 있지 않습니다'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'cron_enabled', TRUE,
    'job_name', v_job_name,
    'last_run_at', v_last_run_at,
    'last_status', v_last_status,
    'message', NULL
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_liquidity_b(NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_market(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_market(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_coin_cron_status() TO anon, authenticated;

-- US-004: 지갑 시스템 - 코인 잔고 및 주간 자동 지급
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

-- REQ-027: 로그인 성공 시 wallet 자동 생성
CREATE OR REPLACE FUNCTION public.login(
  p_student_number BIGINT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_input_hash TEXT;
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

  INSERT INTO public.wallets (user_id, balance)
  VALUES (v_user.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', TRUE,
    'user_id', v_user.id,
    'username', v_user.username,
    'password_changed', COALESCE(v_user.password_changed, FALSE)
  );
END;
$$;

-- REQ-028: 주간 코인 자동 지급 RPC
CREATE OR REPLACE FUNCTION public.distribute_weekly_coins(
  p_amount NUMERIC DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users_count INTEGER := 0;
  v_total_distributed NUMERIC := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '지급 코인은 0보다 커야 합니다';
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  SELECT u.id, 0
  FROM public.users u
  ON CONFLICT (user_id) DO NOTHING;

  WITH updated_wallets AS (
    UPDATE public.wallets w
    SET
      balance = w.balance + p_amount,
      updated_at = NOW()
    FROM public.users u
    WHERE u.id = w.user_id
    RETURNING w.user_id, w.balance
  ), inserted_transactions AS (
    INSERT INTO public.transactions (
      user_id,
      type,
      amount,
      balance_after,
      reference_id,
      description
    )
    SELECT
      uw.user_id,
      'WEEKLY_GRANT',
      p_amount,
      uw.balance,
      NULL,
      '주간 코인 지급'
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

-- REQ-030: 관리자 단건 코인 지급 RPC
CREATE OR REPLACE FUNCTION public.admin_grant_coins(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, 0)
    RETURNING * INTO v_wallet;
  END IF;

  v_new_balance := v_wallet.balance + p_amount;

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
    p_user_id,
    'ADMIN_GRANT',
    p_amount,
    v_new_balance,
    NULL,
    '관리자 코인 지급'
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

-- REQ-031 지원: 현재 지갑 잔고 조회 RPC
CREATE OR REPLACE FUNCTION public.get_wallet_balance(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION '사용자 정보가 올바르지 않습니다';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION '사용자 정보를 찾을 수 없습니다';
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance
  INTO v_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'success', TRUE,
    'balance', COALESCE(v_balance, 0)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', SQLERRM
    );
END;
$$;

-- REQ-029: pg_cron 주간 자동 실행 (월요일 00:00 KST = 일요일 15:00 UTC)
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron 확장 활성화 실패(수동 트리거 사용): %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      EXECUTE
        'SELECT jobid FROM cron.job WHERE jobname = ''weekly_coin_distribution'' LIMIT 1'
      INTO v_job_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_job_id := NULL;
    END;

    IF v_job_id IS NOT NULL THEN
      BEGIN
        EXECUTE format('SELECT cron.unschedule(%s)', v_job_id);
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE '기존 cron 작업 해제 실패: %', SQLERRM;
      END;
    END IF;

    BEGIN
      EXECUTE
        'SELECT cron.schedule(''weekly_coin_distribution'', ''0 15 * * 0'', ''SELECT public.distribute_weekly_coins();'')';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'cron 스케줄 등록 실패(수동 트리거 사용): %', SQLERRM;
    END;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.login(BIGINT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_weekly_coins(NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_coins(UUID, NUMERIC) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO anon, authenticated;

-- 시작 코인 1000, 주간 구제금융 300 설정

-- 1. 주간 구제금융 기본값 1000 → 300
CREATE OR REPLACE FUNCTION public.distribute_weekly_coins(
  p_amount NUMERIC DEFAULT 300
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- 2. 로그인 시 첫 지갑 생성 → 시작 코인 1000 지급
CREATE OR REPLACE FUNCTION public.login(
  p_student_number BIGINT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, extensions
AS $$
DECLARE
  v_user RECORD;
  v_input_hash TEXT;
  v_is_new_wallet BOOLEAN := FALSE;
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

  -- 지갑이 없으면 시작 코인 1000으로 생성
  INSERT INTO public.wallets (user_id, balance)
  VALUES (v_user.id, 1000)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING TRUE INTO v_is_new_wallet;

  -- 새 지갑이면 시작 코인 트랜잭션 기록
  IF v_is_new_wallet THEN
    INSERT INTO public.transactions (
      user_id, type, amount, balance_after, reference_id, description
    ) VALUES (
      v_user.id, 'ADMIN_GRANT', 1000, 1000, NULL, '시작 코인 지급'
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

GRANT EXECUTE ON FUNCTION public.login(BIGINT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.distribute_weekly_coins(NUMERIC) TO anon, authenticated;

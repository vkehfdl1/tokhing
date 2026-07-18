-- Fix: canceled games must never be settled as HOME/AWAY/DRAW.
-- Root cause: admin settle UI defaulted unresolved markets to HOME, and
-- settle_market RPC did not check the underlying game_status.
-- Also temporarily relax wallet non-negativity so full economic rollbacks
-- of already-spent wrongful settlements can complete; restore >= 0 later
-- once affected balances recover.

-- 1) Temporary wallet floor (prod already applied; keep schema in sync)
ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_balance_check;
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_balance_check
  CHECK (balance >= -100000);

-- 2) settle_market: refuse when linked game is CANCELED
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
  v_game public.games%ROWTYPE;
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

  -- Hard block: canceled games must use cancel_market (cost-basis refund)
  SELECT *
  INTO v_game
  FROM public.games
  WHERE id = v_market.game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '마켓에 연결된 경기를 찾을 수 없습니다';
  END IF;

  IF UPPER(BTRIM(COALESCE(v_game.game_status::text, ''))) = 'CANCELED' THEN
    RAISE EXCEPTION '취소된 경기는 정산할 수 없습니다. 마켓 취소(원가 환급)를 사용하세요';
  END IF;

  IF UPPER(BTRIM(COALESCE(v_game.game_status::text, ''))) <> 'FINISHED' THEN
    RAISE EXCEPTION '종료되지 않은 경기는 정산할 수 없습니다 (현재 상태: %)', v_game.game_status;
  END IF;

  -- Season hard-block
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
    SELECT *
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_user_payout.user_id
      AND season_id = v_market.season_id
    FOR UPDATE;

    IF NOT FOUND THEN
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

GRANT EXECUTE ON FUNCTION public.settle_market(INTEGER, TEXT) TO anon, authenticated;

-- Price Snapshots: 매 거래마다 3종목 가격을 스냅샷
-- CONVENTION: VARCHAR 컬럼을 TEXT RETURNS TABLE에 매핑할 때 반드시 ::TEXT 캐스트 사용

-- A. price_snapshots 테이블
CREATE TABLE IF NOT EXISTS public.price_snapshots (
  id SERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES public.orders(id) ON DELETE SET NULL,
  home_price NUMERIC NOT NULL,
  away_price NUMERIC NOT NULL,
  draw_price NUMERIC NOT NULL,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_snapshots_market_time
  ON public.price_snapshots (market_id, snapshot_at);

ALTER TABLE public.price_snapshots DISABLE ROW LEVEL SECURITY;

-- B. 트리거 함수: 거래(주문) 후 가격 스냅샷
CREATE OR REPLACE FUNCTION public.fn_snapshot_after_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_market public.markets%ROWTYPE;
  v_max_q NUMERIC;
  v_e_home NUMERIC;
  v_e_away NUMERIC;
  v_e_draw NUMERIC;
  v_denom NUMERIC;
  v_home_price NUMERIC;
  v_away_price NUMERIC;
  v_draw_price NUMERIC;
BEGIN
  SELECT * INTO v_market
  FROM public.markets
  WHERE id = NEW.market_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_max_q := GREATEST(v_market.q_home, v_market.q_away, v_market.q_draw);
  v_e_home := EXP((v_market.q_home - v_max_q) / v_market.b);
  v_e_away := EXP((v_market.q_away - v_max_q) / v_market.b);
  v_e_draw := EXP((v_market.q_draw - v_max_q) / v_market.b);
  v_denom := v_e_home + v_e_away + v_e_draw;

  v_home_price := 100 * v_e_home / v_denom;
  v_away_price := 100 * v_e_away / v_denom;
  v_draw_price := 100 * v_e_draw / v_denom;

  INSERT INTO public.price_snapshots (market_id, order_id, home_price, away_price, draw_price, snapshot_at)
  VALUES (NEW.market_id, NEW.id, v_home_price, v_away_price, v_draw_price, NOW());

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_after_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_after_order();

-- C. 트리거 함수: 마켓 생성 시 초기 가격 스냅샷
CREATE OR REPLACE FUNCTION public.fn_snapshot_on_market_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO public.price_snapshots (market_id, order_id, home_price, away_price, draw_price, snapshot_at)
  VALUES (
    NEW.id,
    NULL,
    COALESCE(NEW.initial_home_price, 33.33),
    COALESCE(NEW.initial_away_price, 33.33),
    COALESCE(NEW.initial_draw_price, 33.34),
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_on_market_create
  AFTER INSERT ON public.markets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_snapshot_on_market_create();

-- D. RPC 함수: 가격 스냅샷 조회
CREATE OR REPLACE FUNCTION public.get_price_snapshots(
  p_market_id INTEGER
)
RETURNS TABLE(
  home_price NUMERIC,
  away_price NUMERIC,
  draw_price NUMERIC,
  snapshot_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_market_id IS NULL THEN
    RAISE EXCEPTION '마켓 정보가 올바르지 않습니다';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.markets WHERE id = p_market_id) THEN
    RAISE EXCEPTION '마켓을 찾을 수 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    ps.home_price,
    ps.away_price,
    ps.draw_price,
    ps.snapshot_at
  FROM public.price_snapshots ps
  WHERE ps.market_id = p_market_id
  ORDER BY ps.snapshot_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_price_snapshots(INTEGER) TO anon, authenticated;

-- E. 기존 데이터 백필: 각 마켓의 orders를 시간순 재생하며 가격 스냅샷 복원
DO $$
DECLARE
  v_mkt RECORD;
  v_ord RECORD;
  v_q_home NUMERIC;
  v_q_away NUMERIC;
  v_q_draw NUMERIC;
  v_b NUMERIC;
  v_max_q NUMERIC;
  v_e_home NUMERIC;
  v_e_away NUMERIC;
  v_e_draw NUMERIC;
  v_denom NUMERIC;
  v_hp NUMERIC;
  v_ap NUMERIC;
  v_dp NUMERIC;
BEGIN
  FOR v_mkt IN
    SELECT id, q_home, q_away, q_draw, b,
           initial_home_price, initial_away_price, initial_draw_price,
           created_at
    FROM public.markets
    ORDER BY id
  LOOP
    -- 이미 백필된 스냅샷이 있으면 스킵
    IF EXISTS (SELECT 1 FROM public.price_snapshots WHERE market_id = v_mkt.id) THEN
      CONTINUE;
    END IF;

    -- 초기 가격 스냅샷
    INSERT INTO public.price_snapshots (market_id, order_id, home_price, away_price, draw_price, snapshot_at)
    VALUES (
      v_mkt.id,
      NULL,
      COALESCE(v_mkt.initial_home_price, 33.33),
      COALESCE(v_mkt.initial_away_price, 33.33),
      COALESCE(v_mkt.initial_draw_price, 33.34),
      v_mkt.created_at
    );

    -- q값을 초기값으로부터 시작하여 orders 재생
    v_b := v_mkt.b;
    -- 초기 q 계산: q_outcome = b * ln(initial_price)
    v_q_home := v_b * LN(COALESCE(v_mkt.initial_home_price, 33.33));
    v_q_away := v_b * LN(COALESCE(v_mkt.initial_away_price, 33.33));
    v_q_draw := v_b * LN(COALESCE(v_mkt.initial_draw_price, 33.34));

    FOR v_ord IN
      SELECT id, outcome, side, quantity, created_at
      FROM public.orders
      WHERE market_id = v_mkt.id
      ORDER BY created_at ASC, id ASC
    LOOP
      -- q값 업데이트
      IF v_ord.side = 'BUY' THEN
        CASE UPPER(v_ord.outcome)
          WHEN 'HOME' THEN v_q_home := v_q_home + v_ord.quantity;
          WHEN 'AWAY' THEN v_q_away := v_q_away + v_ord.quantity;
          WHEN 'DRAW' THEN v_q_draw := v_q_draw + v_ord.quantity;
        END CASE;
      ELSE
        CASE UPPER(v_ord.outcome)
          WHEN 'HOME' THEN v_q_home := v_q_home - v_ord.quantity;
          WHEN 'AWAY' THEN v_q_away := v_q_away - v_ord.quantity;
          WHEN 'DRAW' THEN v_q_draw := v_q_draw - v_ord.quantity;
        END CASE;
      END IF;

      -- LMSR 가격 계산
      v_max_q := GREATEST(v_q_home, v_q_away, v_q_draw);
      v_e_home := EXP((v_q_home - v_max_q) / v_b);
      v_e_away := EXP((v_q_away - v_max_q) / v_b);
      v_e_draw := EXP((v_q_draw - v_max_q) / v_b);
      v_denom := v_e_home + v_e_away + v_e_draw;

      v_hp := 100 * v_e_home / v_denom;
      v_ap := 100 * v_e_away / v_denom;
      v_dp := 100 * v_e_draw / v_denom;

      INSERT INTO public.price_snapshots (market_id, order_id, home_price, away_price, draw_price, snapshot_at)
      VALUES (v_mkt.id, v_ord.id, v_hp, v_ap, v_dp, v_ord.created_at);
    END LOOP;
  END LOOP;
END;
$$;

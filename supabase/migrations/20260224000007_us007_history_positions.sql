-- US-007: 거래 히스토리 & 포지션 관리 화면 지원 RPC
-- CONVENTION: VARCHAR 컬럼을 TEXT RETURNS TABLE에 매핑할 때 반드시 ::TEXT 캐스트 사용
--             (PostgreSQL은 RETURNS TABLE에서 VARCHAR ≠ TEXT로 취급 → 42804 에러)

-- REQ-049 지원: 진행 중 포지션 조회
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

-- REQ-050 지원: 날짜 필터링된 거래 내역 조회
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

-- REQ-051 지원: 정산 내역 + 최종 손익 조회
CREATE OR REPLACE FUNCTION public.get_user_settlement_history(
  p_user_id UUID
)
RETURNS TABLE(
  market_id INTEGER,
  settled_at TIMESTAMPTZ,
  settlement_amount NUMERIC,
  net_invested NUMERIC,
  final_pnl NUMERIC,
  home_quantity NUMERIC,
  away_quantity NUMERIC,
  draw_quantity NUMERIC
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
      COALESCE(SUM(t.amount), 0) AS settlement_amount
    FROM public.transactions t
    WHERE t.user_id = p_user_id
      AND t.type = 'SETTLEMENT'
      AND t.reference_id IS NOT NULL
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
    GROUP BY o.market_id
  )
  SELECT
    s.market_id,
    s.settled_at,
    s.settlement_amount,
    COALESCE(a.net_invested, 0) AS net_invested,
    s.settlement_amount - COALESCE(a.net_invested, 0) AS final_pnl,
    COALESCE(a.home_quantity, 0) AS home_quantity,
    COALESCE(a.away_quantity, 0) AS away_quantity,
    COALESCE(a.draw_quantity, 0) AS draw_quantity
  FROM settlement_transactions s
  LEFT JOIN order_aggregates a
    ON a.market_id = s.market_id
  ORDER BY s.settled_at DESC, s.market_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_open_positions(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_orders_by_date(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_settlement_history(UUID) TO anon, authenticated;

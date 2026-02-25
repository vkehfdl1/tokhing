-- US-006: 마켓 상세 & 거래 화면 지원 RPC

-- REQ-040 지원: 특정 유저의 마켓 포지션 조회
CREATE OR REPLACE FUNCTION public.get_market_positions(
  p_user_id UUID,
  p_market_id INTEGER
)
RETURNS TABLE(
  outcome TEXT,
  quantity NUMERIC,
  avg_entry_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    p.outcome,
    p.quantity,
    p.avg_entry_price
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

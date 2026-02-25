-- Fix: 리더보드 함수 VARCHAR→TEXT 42804 에러 수정
-- users.username이 VARCHAR(50)인데 RETURNS TABLE에서 TEXT로 선언되어
-- "Returned type character varying(50) does not match expected type text" 에러 발생
-- Convention: VARCHAR 컬럼 → TEXT 리턴 시 반드시 ::TEXT 캐스트 사용

-- ============================================================
-- 1) get_leaderboard_balance: u.username → u.username::TEXT
-- ============================================================
DROP FUNCTION IF EXISTS public.get_leaderboard_balance();
CREATE OR REPLACE FUNCTION public.get_leaderboard_balance()
RETURNS TABLE(
  rank BIGINT,
  user_id UUID,
  username TEXT,
  balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH leaderboard AS (
    SELECT
      u.id AS user_id,
      u.username::TEXT,
      COALESCE(w.balance, 0) AS balance
    FROM public.users u
    LEFT JOIN public.wallets w
      ON w.user_id = u.id
  ),
  ranked AS (
    SELECT
      RANK() OVER (
        ORDER BY
          l.balance DESC,
          l.username ASC,
          l.user_id ASC
      )::BIGINT AS position_rank,
      l.user_id,
      l.username,
      l.balance
    FROM leaderboard l
  )
  SELECT
    r.position_rank AS rank,
    r.user_id,
    r.username,
    r.balance
  FROM ranked r
  ORDER BY
    r.position_rank ASC,
    r.username ASC,
    r.user_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_balance() TO anon, authenticated;

-- ============================================================
-- 2) get_leaderboard_roi: u.username → u.username::TEXT
-- ============================================================
DROP FUNCTION IF EXISTS public.get_leaderboard_roi();
CREATE OR REPLACE FUNCTION public.get_leaderboard_roi()
RETURNS TABLE(
  rank BIGINT,
  user_id UUID,
  username TEXT,
  roi_percent NUMERIC,
  current_balance NUMERIC,
  total_granted NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH granted AS (
    SELECT
      t.user_id,
      COALESCE(SUM(t.amount), 0) AS total_granted
    FROM public.transactions t
    WHERE t.type IN ('WEEKLY_GRANT', 'ADMIN_GRANT')
    GROUP BY t.user_id
  ),
  roi_base AS (
    SELECT
      u.id AS user_id,
      u.username::TEXT,
      COALESCE(w.balance, 0) AS current_balance,
      COALESCE(g.total_granted, 0) AS total_granted
    FROM public.users u
    LEFT JOIN public.wallets w
      ON w.user_id = u.id
    LEFT JOIN granted g
      ON g.user_id = u.id
  ),
  scored AS (
    SELECT
      rb.user_id,
      rb.username,
      rb.current_balance,
      rb.total_granted,
      CASE
        WHEN rb.total_granted > 0
          THEN ((rb.current_balance - rb.total_granted) / rb.total_granted) * 100
        ELSE 0
      END AS roi_percent
    FROM roi_base rb
  ),
  ranked AS (
    SELECT
      RANK() OVER (
        ORDER BY
          s.roi_percent DESC,
          s.current_balance DESC,
          s.username ASC,
          s.user_id ASC
      )::BIGINT AS position_rank,
      s.user_id,
      s.username,
      s.roi_percent,
      s.current_balance,
      s.total_granted
    FROM scored s
  )
  SELECT
    r.position_rank AS rank,
    r.user_id,
    r.username,
    r.roi_percent,
    r.current_balance,
    r.total_granted
  FROM ranked r
  ORDER BY
    r.position_rank ASC,
    r.username ASC,
    r.user_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard_roi() TO anon, authenticated;

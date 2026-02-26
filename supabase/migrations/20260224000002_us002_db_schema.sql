-- US-002: LMSR 예측시장용 DB 스키마 마이그레이션
-- 실행 대상: Supabase SQL Editor 또는 `supabase db execute`

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- REQ-010 wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wallets_user_id_key UNIQUE (user_id)
);

DROP TRIGGER IF EXISTS trg_wallets_set_updated_at ON public.wallets;
CREATE TRIGGER trg_wallets_set_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- REQ-011 settings
CREATE TABLE IF NOT EXISTS public.settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR NOT NULL UNIQUE,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_settings_set_updated_at ON public.settings;
CREATE TRIGGER trg_settings_set_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.settings (key, value, updated_at)
VALUES ('liquidity_b', '{"value": 10}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

-- REQ-012 markets
CREATE TABLE IF NOT EXISTS public.markets (
  id SERIAL PRIMARY KEY,
  game_id INTEGER NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  q_home NUMERIC NOT NULL DEFAULT 0,
  q_away NUMERIC NOT NULL DEFAULT 0,
  q_draw NUMERIC NOT NULL DEFAULT 0,
  b NUMERIC NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'OPEN',
  result VARCHAR,
  initial_home_price NUMERIC,
  initial_away_price NUMERIC,
  initial_draw_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT markets_status_check CHECK (status IN ('OPEN', 'CLOSED', 'SETTLED', 'CANCELED')),
  CONSTRAINT markets_result_check CHECK (result IS NULL OR result IN ('HOME', 'AWAY', 'DRAW'))
);

DROP TRIGGER IF EXISTS trg_markets_set_updated_at ON public.markets;
CREATE TRIGGER trg_markets_set_updated_at
BEFORE UPDATE ON public.markets
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- REQ-013 orders
CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome VARCHAR NOT NULL CHECK (outcome IN ('HOME', 'AWAY', 'DRAW')),
  side VARCHAR NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  total_cost NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REQ-014 positions
CREATE TABLE IF NOT EXISTS public.positions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  market_id INTEGER NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  outcome VARCHAR NOT NULL CHECK (outcome IN ('HOME', 'AWAY', 'DRAW')),
  quantity NUMERIC NOT NULL DEFAULT 0,
  avg_entry_price NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT positions_user_market_outcome_key UNIQUE (user_id, market_id, outcome)
);

DROP TRIGGER IF EXISTS trg_positions_set_updated_at ON public.positions;
CREATE TRIGGER trg_positions_set_updated_at
BEFORE UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- REQ-015 transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type VARCHAR NOT NULL CHECK (type IN ('BUY', 'SELL', 'SETTLEMENT', 'WEEKLY_GRANT', 'ADMIN_GRANT')),
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_id INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REQ-017 RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_select_own ON public.wallets;
CREATE POLICY wallets_select_own
ON public.wallets
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS positions_select_own ON public.positions;
CREATE POLICY positions_select_own
ON public.positions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS orders_select_own ON public.orders;
CREATE POLICY orders_select_own
ON public.orders
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own
ON public.transactions
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS markets_select_all ON public.markets;
CREATE POLICY markets_select_all
ON public.markets
FOR SELECT
USING (TRUE);

DROP POLICY IF EXISTS settings_select_all ON public.settings;
CREATE POLICY settings_select_all
ON public.settings
FOR SELECT
USING (TRUE);

GRANT SELECT ON public.wallets, public.settings, public.markets, public.orders, public.positions, public.transactions TO anon, authenticated;

-- REQ-018 indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_markets_game_id ON public.markets (game_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_market ON public.orders (user_id, market_id);
CREATE INDEX IF NOT EXISTS idx_positions_user_market ON public.positions (user_id, market_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created_at ON public.transactions (user_id, created_at);

-- REQ-016 predictions는 삭제하지 않고 유지 (스키마 변경 없음)

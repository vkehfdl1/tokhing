-- New season wallet reset: set every existing member wallet balance to 1,000 coins.
INSERT INTO public.wallets (user_id, balance)
SELECT u.id, 1000
FROM public.users u
ON CONFLICT (user_id)
DO UPDATE SET
  balance = EXCLUDED.balance,
  updated_at = NOW();

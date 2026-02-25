-- b값 10 → 200 변경 (150명 규모, 마켓당 50명 참여 기준 산정)
UPDATE public.settings
SET value = '{"value": 200}', updated_at = NOW()
WHERE key = 'liquidity_b';

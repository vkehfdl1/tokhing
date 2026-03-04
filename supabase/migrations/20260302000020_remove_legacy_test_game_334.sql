-- Remove legacy past test game (id=334) and related market activity

DELETE FROM public.orders
WHERE market_id IN (
  SELECT id FROM public.markets WHERE game_id = 334
);

DELETE FROM public.positions
WHERE market_id IN (
  SELECT id FROM public.markets WHERE game_id = 334
);

DELETE FROM public.predictions
WHERE game_id = 334;

DELETE FROM public.markets
WHERE game_id = 334;

DELETE FROM public.games
WHERE id = 334;

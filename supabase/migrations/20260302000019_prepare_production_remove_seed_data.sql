-- Production prep: remove seed test users and seed test matches.
-- This migration only targets known seed artifacts:
-- - users: a111.../a222.../a333... (student_number 2024001~2024003)
-- - games: id 901~905

DO $$
DECLARE
  v_test_user_ids UUID[] := ARRAY[
    'a1111111-1111-1111-1111-111111111111'::UUID,
    'a2222222-2222-2222-2222-222222222222'::UUID,
    'a3333333-3333-3333-3333-333333333333'::UUID
  ];
BEGIN
  -- Remove dependent records first
  DELETE FROM public.transactions
  WHERE user_id = ANY(v_test_user_ids);

  DELETE FROM public.orders
  WHERE user_id = ANY(v_test_user_ids)
     OR market_id IN (
       SELECT id FROM public.markets WHERE game_id BETWEEN 901 AND 905
     );

  DELETE FROM public.positions
  WHERE user_id = ANY(v_test_user_ids)
     OR market_id IN (
       SELECT id FROM public.markets WHERE game_id BETWEEN 901 AND 905
     );

  DELETE FROM public.predictions
  WHERE user_id = ANY(v_test_user_ids)
     OR game_id BETWEEN 901 AND 905;

  DELETE FROM public.wallets
  WHERE user_id = ANY(v_test_user_ids);

  DELETE FROM public.markets
  WHERE game_id BETWEEN 901 AND 905;

  DELETE FROM public.games
  WHERE id BETWEEN 901 AND 905;

  DELETE FROM public.users
  WHERE id = ANY(v_test_user_ids)
     OR student_number IN (2024001, 2024002, 2024003);
END $$;

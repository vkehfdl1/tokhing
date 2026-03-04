-- Remove legacy predictions system (replaced by LMSR market engine)
-- Also removes dead cron jobs: auto_update_game_status, calculate_daily_matches

-- 1. Remove cron jobs
DO $$
BEGIN
  PERFORM cron.unschedule('auto_update_game_status');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job auto_update_game_status not found: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('calculate_daily_matches_halfhour_22to24_kst');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron job calculate_daily_matches_halfhour_22to24_kst not found: %', SQLERRM;
END;
$$;

-- 2. Drop dead functions
DROP FUNCTION IF EXISTS public.auto_update_game_status();
DROP FUNCTION IF EXISTS public.calculate_daily_matches(DATE);
DROP FUNCTION IF EXISTS public.get_prediction_ratios_by_date(DATE);
DROP FUNCTION IF EXISTS public.get_prediction_ratios_by_date_grouped(DATE);
DROP FUNCTION IF EXISTS public.get_leaderboard(DATE, DATE);

-- 3. Drop legacy predictions table
DROP TABLE IF EXISTS public.predictions CASCADE;

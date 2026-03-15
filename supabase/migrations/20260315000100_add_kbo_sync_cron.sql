-- KBO 자동 수집/등록/갱신 배치
-- 구조: Supabase Cron -> pg_net HTTP POST -> Edge Function(kbo-sync)
--
-- 사전 준비(대시보드 SQL 1회 실행 필요):
--   select vault.create_secret('<YOUR_KBO_SYNC_SECRET>', 'kbo_sync_secret');

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE INDEX IF NOT EXISTS idx_games_date_home_away
ON public.games (game_date, home_team_id, away_team_id);

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  BEGIN
    EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = ''kbo_daily_seed'' LIMIT 1'
    INTO v_job_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_job_id := NULL;
  END;

  IF v_job_id IS NOT NULL THEN
    BEGIN
      EXECUTE format('SELECT cron.unschedule(%s)', v_job_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '기존 kbo_daily_seed 해제 실패: %', SQLERRM;
    END;
  END IF;

  BEGIN
    EXECUTE $sql$
      SELECT cron.schedule(
        'kbo_daily_seed',
        '0 18 * * *',
        $job$
        SELECT
          net.http_post(
            url := 'https://wajecvhfldtxdwkfbiaj.supabase.co/functions/v1/kbo-sync',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-kbo-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kbo_sync_secret')
            ),
            body := '{"mode":"daily_seed"}'::jsonb
          ) AS request_id;
        $job$
      )
    $sql$;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'kbo_daily_seed 등록 실패: %', SQLERRM;
  END;
END;
$$;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  BEGIN
    EXECUTE
      'SELECT jobid FROM cron.job WHERE jobname = ''kbo_hourly_refresh'' LIMIT 1'
    INTO v_job_id;
  EXCEPTION
    WHEN OTHERS THEN
      v_job_id := NULL;
  END;

  IF v_job_id IS NOT NULL THEN
    BEGIN
      EXECUTE format('SELECT cron.unschedule(%s)', v_job_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '기존 kbo_hourly_refresh 해제 실패: %', SQLERRM;
    END;
  END IF;

  BEGIN
    EXECUTE $sql$
      SELECT cron.schedule(
        'kbo_hourly_refresh',
        '0 4-14 * * *',
        $job$
        SELECT
          net.http_post(
            url := 'https://wajecvhfldtxdwkfbiaj.supabase.co/functions/v1/kbo-sync',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'x-kbo-sync-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'kbo_sync_secret')
            ),
            body := '{"mode":"hourly_refresh"}'::jsonb
          ) AS request_id;
        $job$
      )
    $sql$;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'kbo_hourly_refresh 등록 실패: %', SQLERRM;
  END;
END;
$$;

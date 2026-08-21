-- KBO 동기화 일정은 운영자가 바꾸는 설정이 아니라 고정값으로 운영한다.
-- 관리자 패널에서 일정/사용 여부를 조정하는 경로를 제거하고 값을 고정한다.

update public.kbo_sync_jobs
set schedule_kst = time '00:10',
    status = 'ACTIVE',
    enabled = true,
    updated_at = now()
where mode = 'DAILY_SEED';

update public.kbo_sync_jobs
set schedule_kst = time '01:00',
    status = 'ACTIVE',
    enabled = true,
    updated_at = now()
where mode = 'HOURLY_REFRESH';

drop function if exists public.admin_update_kbo_sync_job(
  uuid,
  text,
  time,
  boolean,
  boolean
);

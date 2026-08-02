begin;
select plan(17);

select has_table('public','weekly_grant_policies','weekly policy table exists');
select has_table('public','weekly_grant_runs','weekly run history exists');
select is((public.get_weekly_grant_status()->>'amount')::numeric,300::numeric,'default amount is 300');
select is(public.get_weekly_grant_status()->>'cron_expression','0 15 * * 0','Monday midnight KST converts to Sunday 15:00 UTC');
select is((public.get_weekly_grant_status()->>'expected_recipient_count')::integer,3,'preview counts recipients');
select is((public.get_weekly_grant_status()->>'estimated_total_payout')::numeric,900::numeric,'preview calculates total payout');

select lives_ok(
  $$select public.admin_update_weekly_grant_policy(null,500,3,time '09:30',true)$$,
  'policy can be changed without SQL'
);
select is(public.get_weekly_grant_status()->>'cron_expression','30 0 * * 3','KST schedule converts exactly to UTC cron');
select is((select schedule from cron.job where jobname='weekly_coin_distribution'),'30 0 * * 3','displayed cron matches scheduler cron');

select lives_ok($$select public.admin_set_weekly_grant_pause(null,true)$$,'automatic grants can be paused');
select ok(not (select active from cron.job where jobname='weekly_coin_distribution'),'pause disables cron execution');
select is(
  public.run_weekly_grant_round(null,'2026-PAUSED','AUTO',now())->>'status',
  'SKIPPED',
  'automatic execution skips while paused'
);
select is(
  public.run_weekly_grant_round(null,'2026-PAUSED','MANUAL',now())->>'status',
  'SUCCESS',
  'authorized manual execution remains available while paused'
);
select is(
  (select count(*)::integer from public.transactions where description='주간 코인 지급 2026-PAUSED'),
  3,
  'manual round pays each recipient once'
);
select is(
  public.run_weekly_grant_round(null,'2026-PAUSED','MANUAL',now())->>'status',
  'SKIPPED',
  'repeated successful round is idempotently skipped'
);
select lives_ok($$select public.admin_set_weekly_grant_pause(null,false)$$,'automatic grants can resume');
select is(
  (
    select count(distinct action)::integer
    from public.admin_audit_logs
    where action in (
      'WEEKLY_GRANT_POLICY_UPDATE','WEEKLY_GRANT_PAUSE',
      'WEEKLY_GRANT_RESUME','WEEKLY_GRANT_MANUAL_RUN'
    )
  ),
  4,
  'policy, pause, resume, and manual run are audited'
);

select * from finish();
rollback;

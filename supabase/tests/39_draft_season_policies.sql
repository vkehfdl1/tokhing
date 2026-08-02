begin;

select plan(21);

select has_column(
  'public',
  'seasons',
  'initial_grant_amount',
  'seasons store configured initial grants'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.admin_update_draft_season(uuid,integer,text,date,date,numeric)',
    'execute'
  ),
  true,
  'anonymous users cannot edit draft seasons'
);

insert into public.seasons (
  name, start_date, end_date, status, initial_grant_amount
)
values (
  'Overlap Fixture',
  date '2027-01-01',
  date '2027-01-31',
  'ARCHIVED',
  1000
);

select throws_ok(
  $$select public.admin_update_draft_season(
    null, 2, 'Invalid Dates', date '2027-03-02', date '2027-03-01', 1500
  )$$,
  'P0001',
  '시작일은 종료일보다 빨라야 합니다',
  'draft updates reject reversed dates'
);
select throws_ok(
  $$select public.admin_update_draft_season(
    null, 2, 'Invalid Grant', date '2027-03-01', date '2027-03-31', 0
  )$$,
  'P0001',
  '초기 지급액은 0보다 커야 합니다',
  'draft updates reject non-positive grants'
);
select throws_ok(
  $$select public.admin_update_draft_season(
    null, 2, 'Overlap', date '2027-01-15', date '2027-02-15', 1500
  )$$,
  'P0001',
  '다른 시즌 기간과 겹칩니다',
  'draft updates reject overlapping periods'
);
select throws_ok(
  $$select public.admin_update_draft_season(
    null, 1, 'Active Edit', date '2026-03-28', date '2026-05-01', 1500
  )$$,
  'P0001',
  'DRAFT 시즌만 수정할 수 있습니다',
  'active seasons are immutable'
);
select throws_ok(
  $$select public.admin_update_draft_season(
    null, 0, 'Archived Edit', date '2026-01-01', date '2026-03-27', 1500
  )$$,
  'P0001',
  'DRAFT 시즌만 수정할 수 있습니다',
  'archived seasons are immutable'
);
select lives_ok(
  $$select public.admin_update_draft_season(
    null, 2, 'Season 2 Edited', date '2027-03-01', date '2027-03-31', 1500
  )$$,
  'draft metadata and grant amount can be updated'
);

insert into public.games (
  id, game_date, game_time, home_team_id, away_team_id,
  home_pitcher, away_pitcher, game_status
)
values (
  9939, date '2027-03-10', '18:30', 1, 2, '', '', 'SCHEDULED'
);
insert into public.markets (game_id, b, season_id)
values (9939, 200, 2);

select is(
  (
    public.get_draft_season_delete_impact(2)->>'linked_matches'
  )::integer,
  1,
  'deletion preview reports linked matches'
);
select is(
  (
    public.get_draft_season_delete_impact(2)->>'linked_markets'
  )::integer,
  1,
  'deletion preview reports linked markets'
);
select throws_ok(
  $$select public.admin_delete_draft_season(null, 2)$$,
  'P0001',
  '연결된 경기 또는 마켓이 있어 DRAFT 시즌을 삭제할 수 없습니다',
  'linked draft seasons cannot be deleted'
);
select throws_ok(
  $$select public.admin_delete_draft_season(null, 1)$$,
  'P0001',
  'DRAFT 시즌만 삭제할 수 있습니다',
  'active seasons cannot be deleted'
);

delete from public.markets where game_id = 9939;
select lives_ok(
  $$select public.admin_delete_draft_season(null, 2)$$,
  'unlinked draft seasons can be deleted'
);

select throws_ok(
  $$select public.admin_create_draft_season(
    null, 'Overlap Create', date '2027-01-10', date '2027-01-20', 1500
  )$$,
  'P0001',
  '다른 시즌 기간과 겹칩니다',
  'draft creation rejects overlapping periods'
);

select lives_ok(
  $$select public.admin_create_draft_season(
    null, 'Season 3', date '2027-02-01', date '2027-02-28', 1500
  )$$,
  'operators can create a configured draft season'
);
select is(
  (
    public.get_season_activation_preview(
      (select id from public.seasons where name = 'Season 3')
    )->>'eligible_members'
  )::integer,
  3,
  'activation preview reports eligible members'
);
select is(
  (
    public.get_season_activation_preview(
      (select id from public.seasons where name = 'Season 3')
    )->>'total_planned_grant'
  )::numeric,
  4500::numeric,
  'activation preview reports total configured grant'
);

update public.markets
set status = 'CANCELED'
where season_id = 1;

select is(
  (
    public.admin_activate_season(
      null,
      (select id from public.seasons where name = 'Season 3')
    )->>'users_granted'
  )::integer,
  3,
  'activation grants every eligible member'
);
select is(
  (
    select count(*)::integer
    from public.wallets
    where season_id = (
      select id from public.seasons where name = 'Season 3'
    )
      and balance = 1500
  ),
  3,
  'activation creates configured wallets'
);
select is(
  (
    select count(*)::integer
    from public.transactions
    where season_id = (
      select id from public.seasons where name = 'Season 3'
    )
      and type = 'SEASON_GRANT'
      and amount = 1500
      and balance_after = 1500
  ),
  3,
  'activation creates matching grant records'
);
select is(
  (
    select count(distinct action)::integer
    from public.admin_audit_logs
    where action in (
      'SEASON_DRAFT_CREATE',
      'SEASON_DRAFT_UPDATE',
      'SEASON_DRAFT_DELETE',
      'SEASON_ACTIVATE'
    )
  ),
  4,
  'all draft mutations and activation are audited'
);

select * from finish();

rollback;

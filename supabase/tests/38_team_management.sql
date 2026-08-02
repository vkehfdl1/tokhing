begin;

select plan(23);

select has_table('public', 'team_aliases', 'team aliases table exists');
select has_table(
  'public',
  'team_mapping_requests',
  'pending team mapping table exists'
);
select has_column('public', 'teams', 'is_active', 'teams can be deactivated');
select has_column(
  'public',
  'teams',
  'merged_into_team_id',
  'merged team destination is retained'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.admin_merge_teams(uuid,integer,integer)',
    'execute'
  ),
  true,
  'anonymous users cannot merge teams'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.resolve_team_mappings(text,text[])',
    'execute'
  ),
  'server boundary can resolve ingestion names'
);

select lives_ok(
  $$select public.admin_upsert_team_alias(
    null, null, 'WBC', 'Korea Republic', 1
  )$$,
  'operators can create source aliases through the governed RPC'
);

select throws_ok(
  $$insert into public.team_aliases (source, alias, team_id)
    values ('wbc', ' korea republic ', 2)$$,
  '23505',
  null,
  'same-source alias conflicts are blocked'
);

select is(
  (
    select mapping_status
    from public.resolve_team_mappings(
      'WBC',
      array['Korea Republic']
    )
  ),
  'MAPPED',
  'source alias maps automatically in preview'
);

select is(
  (
    select mapping_status
    from public.resolve_team_mappings(
      'FRIENDLY',
      array['Unknown Club']
    )
  ),
  'PENDING',
  'unknown ingestion values stay pending'
);

select is(
  (
    select count(*)::integer
    from public.team_mapping_requests
    where source = 'FRIENDLY'
      and normalized_external_name = 'unknown club'
      and status = 'PENDING'
  ),
  1,
  'unknown values are not auto-created as teams'
);

select is(
  public.admin_approve_team_mapping(
    null,
    (
      select id
      from public.team_mapping_requests
      where source = 'FRIENDLY'
        and normalized_external_name = 'unknown club'
        and status = 'PENDING'
    ),
    1,
    null,
    null,
    null
  ),
  1,
  'operator approval maps a pending value to an existing team'
);

select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where action = 'TEAM_MAPPING_APPROVE'
  ),
  'mapping approval writes an audit record'
);

select lives_ok(
  $$select public.admin_upsert_team(
    null, null, '테스트 중복팀', 'DUP', '#123456'
  )$$,
  'operators can create governed teams'
);

select lives_ok(
  $$select public.admin_upsert_team(
    null,
    (select id from public.teams where short_name = 'DUP'),
    '테스트 중복팀 수정',
    'DUP',
    '#123457'
  )$$,
  'operators can update governed team metadata'
);

select throws_ok(
  $$insert into public.teams (name, short_name, team_color)
    values ('다른 테스트팀', 'dup', '#654321')$$,
  '23505',
  null,
  'duplicate active abbreviations are blocked'
);

select is(
  (
    select count(distinct action)::integer
    from public.admin_audit_logs
    where action in ('TEAM_ALIAS_CREATE', 'TEAM_CREATE', 'TEAM_UPDATE')
  ),
  3,
  'alias and team metadata mutations write audit records'
);

insert into public.teams (name, short_name, team_color)
values
  ('병합 원본', 'SRC', '#112233'),
  ('병합 대상', 'DST', '#445566');

insert into public.games (
  id,
  game_date,
  game_time,
  home_team_id,
  away_team_id,
  home_pitcher,
  away_pitcher,
  game_status
)
values (
  9838,
  current_date + 30,
  '18:30',
  (select id from public.teams where short_name = 'SRC'),
  1,
  '',
  '',
  'SCHEDULED'
);

insert into public.markets (game_id, b, season_id)
values (9838, 200, 1);

select throws_ok(
  $$delete from public.teams
    where id = (select home_team_id from public.games where id = 9838)$$,
  '23503',
  null,
  'physical deletion of an in-use team is blocked'
);

select is(
  (
    public.admin_merge_teams(
      null,
      (select id from public.teams where short_name = 'SRC'),
      (select id from public.teams where short_name = 'DST')
    )->>'affected_matches'
  )::integer,
  1,
  'merge preview reports affected matches'
);

select is(
  (
    select home_team_id
    from public.games
    where id = 9838
  ),
  (select id from public.teams where short_name = 'DST'),
  'merge reconnects existing game references'
);

select ok(
  exists (
    select 1
    from public.markets
    where game_id = 9838
  ),
  'merge preserves markets linked through games'
);

select ok(
  (
    select not is_active
      and merged_into_team_id =
        (select id from public.teams where short_name = 'DST')
    from public.teams
    where short_name = 'SRC'
  ),
  'merge deactivates source and retains destination'
);

select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where action = 'TEAM_MERGE'
      and target_id =
        (select id::text from public.teams where short_name = 'DST')
  ),
  'merge writes an audit record'
);

select * from finish();

rollback;

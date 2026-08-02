begin;

select plan(22);

select isnt(
  has_function_privilege(
    'anon',
    'public.admin_process_season_markets(uuid,integer,jsonb)',
    'execute'
  ),
  true,
  'anonymous users cannot bulk process markets'
);
select is(
  (
    public.get_season_close_readiness(1, 1, 2)
      ->'status_counts'->>'OPEN'
  )::integer,
  3,
  'readiness reports OPEN count'
);
select is(
  (
    public.get_season_close_readiness(1, 1, 2)
      ->'status_counts'->>'CLOSED'
  )::integer,
  1,
  'readiness reports CLOSED count'
);
select is(
  (
    public.get_season_close_readiness(1, 1, 2)
      ->>'unsettled_count'
  )::integer,
  4,
  'readiness reports every blocker'
);
select is(
  jsonb_array_length(
    public.get_season_close_readiness(1, 1, 2)->'items'
  ),
  2,
  'readiness paginates blocking markets'
);
select is(
  (
    select item->>'classification'
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'market_id')::integer = 4
  ),
  'AUTO_DECIDABLE',
  'finished scored matches are automatically decidable'
);
select is(
  (
    select item->>'proposed_result'
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'market_id')::integer = 4
  ),
  'HOME',
  'finished scored matches include proposed result'
);

insert into public.games (
  id, game_date, game_time, home_team_id, away_team_id,
  home_pitcher, away_pitcher, game_status
)
values (
  9940, current_date, '18:30', 1, 2, '', '', 'CANCELED'
);
insert into public.markets (game_id, b, season_id, status)
values (9940, 200, 1, 'OPEN');

select is(
  (
    select item->>'classification'
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'game_id')::integer = 9940
  ),
  'CANCELLATION_RECOMMENDED',
  'canceled games recommend cancellation'
);
select is(
  (
    select item->'eligible_actions'
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'game_id')::integer = 9940
  ),
  '["CANCEL"]'::jsonb,
  'canceled games permit only cancellation'
);

insert into public.positions (
  user_id, market_id, outcome, quantity, avg_entry_price, season_id
)
values (
  (select id from public.users order by student_number limit 1),
  4,
  'HOME',
  2,
  30,
  1
);

select is(
  (
    select (item->>'position_holder_count')::integer
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'market_id')::integer = 4
  ),
  1,
  'readiness previews affected position holders'
);
select is(
  (
    select (item->>'estimated_payout')::numeric
    from jsonb_array_elements(
      public.get_season_close_readiness(1, 1, 20)->'items'
    ) item
    where (item->>'market_id')::integer = 4
  ),
  200::numeric,
  'readiness estimates settlement payout'
);

select is(
  (
    public.admin_process_season_markets(
      null,
      1,
      jsonb_build_array(
        jsonb_build_object(
          'market_id', 4, 'action', 'SETTLE', 'result', 'HOME'
        ),
        jsonb_build_object(
          'market_id', 999999, 'action', 'CLOSE'
        )
      )
    )->>'success_count'
  )::integer,
  1,
  'bulk processing reports successful items'
);
select is(
  (
    select count(*)::integer
    from public.transactions
    where reference_id = 4
      and description = '마켓 정산 - HOME'
  ),
  1,
  'settlement creates one payout record'
);
select is(
  (
    public.admin_process_season_markets(
      null,
      1,
      jsonb_build_array(
        jsonb_build_object(
          'market_id', 4, 'action', 'SETTLE', 'result', 'HOME'
        )
      )
    )->'results'->0->>'status'
  ),
  'SKIPPED',
  'repeated settlement is idempotently skipped'
);
select is(
  (
    select count(*)::integer
    from public.transactions
    where reference_id = 4
      and description = '마켓 정산 - HOME'
  ),
  1,
  'repeated settlement does not duplicate payouts'
);

select lives_ok(
  $$select public.admin_process_season_markets(
    null,
    1,
    jsonb_build_array(
      jsonb_build_object('market_id', 1, 'action', 'CANCEL'),
      jsonb_build_object('market_id', 2, 'action', 'CANCEL'),
      jsonb_build_object('market_id', 3, 'action', 'CANCEL'),
      jsonb_build_object(
        'market_id',
        (select id from public.markets where game_id = 9940),
        'action',
        'CANCEL'
      )
    )
  )$$,
  'remaining blockers can be canceled in one batch'
);
select is(
  (
    public.get_season_close_readiness(1, 1, 20)
      ->>'unsettled_count'
  )::integer,
  0,
  'readiness clears only after every blocker is resolved'
);
select ok(
  (
    public.get_season_close_readiness(1, 1, 20)
      ->>'closure_available'
  )::boolean,
  'season closure is available at zero blockers'
);
select lives_ok(
  $$select public.admin_close_ready_season(null, 1)$$,
  'ready season can be closed'
);
select is(
  (select status::text from public.seasons where id = 1),
  'ARCHIVED',
  'closing transitions the active season to archived'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where action = 'SEASON_MARKET_BULK_PROCESS'
      and before_state ? 'inputs'
      and after_state ? 'results'
  ),
  'bulk executions audit inputs, targets, and results'
);
select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where action = 'SEASON_CLOSE'
  ),
  'season closure is audit logged'
);

select * from finish();

rollback;

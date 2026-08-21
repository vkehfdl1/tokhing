begin;

select plan(16);

-- The local seed includes the sample OWNER used for manual testing. Disable it
-- inside this rolled-back test transaction so this fixture remains isolated.
update public.admin_operators
set is_active = false
where username = 'owner';

insert into public.admin_operators (
  id,
  username,
  display_name,
  role,
  password_hash,
  must_change_password
)
values (
  '36000000-0000-0000-0000-000000000010',
  'only_owner',
  'Only Owner',
  'OWNER',
  'test-only-hash',
  false
);

select is(
  (
    public.admin_update_operator(
      '36000000-0000-0000-0000-000000000010',
      '36000000-0000-0000-0000-000000000010',
      '{"is_active": false}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'serialized update rejects removing the last active owner'
);

select ok(
  (
    select is_active
    from public.admin_operators
    where id = '36000000-0000-0000-0000-000000000010'
  ),
  'failed last-owner update leaves the owner active'
);

select is(
  (
    public.admin_update_operator(
      '36000000-0000-0000-0000-000000000010',
      '36000000-0000-0000-0000-000000000010',
      '{"password_hash": "forced-reset-hash"}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'resetting the sole usable owner password is rejected'
);

select is(
  (
    select must_change_password
    from public.admin_operators
    where id = '36000000-0000-0000-0000-000000000010'
  ),
  false,
  'rejected sole-owner reset preserves usable owner status'
);

insert into public.games (
  id,
  game_date,
  game_time,
  home_team_id,
  away_team_id,
  game_status
)
values (
  360001,
  '2099-01-01',
  '18:00',
  1,
  2,
  'SCHEDULED'
);

select is(
  (
    public.admin_apply_game_data(
      '36000000-0000-0000-0000-000000000010',
      '{"action":"save_games","targetDate":"2099-01-01","games":[]}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  true,
  'saving a date with a removed unlinked game succeeds'
);

select is(
  (select count(*)::integer from public.games where id = 360001),
  0,
  'removed unlinked game is deleted from the database'
);

insert into public.games (
  id,
  game_date,
  game_time,
  home_team_id,
  away_team_id,
  game_status
)
values (
  360002,
  '2099-01-02',
  '18:00',
  1,
  2,
  'SCHEDULED'
);

select public.create_market(360002, 33, 33, 34);

select is(
  (
    public.admin_apply_game_data(
      '36000000-0000-0000-0000-000000000010',
      '{"action":"save_games","targetDate":"2099-01-02","games":[]}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'linked games cannot be deleted by the basic game editor'
);

select is(
  (select count(*)::integer from public.games where id = 360002),
  1,
  'blocked linked-game deletion preserves the game'
);

select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where operator_id = '36000000-0000-0000-0000-000000000010'
      and action = 'ADMIN_GAMES_SAVED'
      and not success
  ),
  'blocked linked-game deletion records a failure audit'
);

insert into public.admin_operators (
  id,
  username,
  display_name,
  role,
  password_hash,
  must_change_password
)
values (
  '36000000-0000-0000-0000-000000000011',
  'other_operator',
  'Other Operator',
  'OPERATOR',
  'other-password-hash',
  false
);

insert into public.admin_sessions (
  id,
  operator_id,
  token_hash,
  expires_at
)
values (
  '36000000-0000-0000-0000-000000000099',
  '36000000-0000-0000-0000-000000000011',
  'other-session-token',
  now() + interval '1 hour'
);

select is(
  (
    public.admin_change_operator_password(
      '36000000-0000-0000-0000-000000000010',
      '36000000-0000-0000-0000-000000000099',
      'test-only-hash',
      'new-password-hash',
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'password change rejects a session owned by another operator'
);

select is(
  (
    select password_hash
    from public.admin_operators
    where id = '36000000-0000-0000-0000-000000000010'
  ),
  'test-only-hash',
  'rejected password change preserves the original hash'
);

insert into public.admin_sessions (
  id,
  operator_id,
  token_hash,
  expires_at
)
values (
  '36000000-0000-0000-0000-000000000098',
  '36000000-0000-0000-0000-000000000010',
  'owner-session-token',
  now() + interval '1 hour'
);

select is(
  (
    public.admin_change_operator_password(
      '36000000-0000-0000-0000-000000000010',
      '36000000-0000-0000-0000-000000000098',
      'stale-password-hash',
      'new-password-hash',
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'password change rejects a stale verified password hash'
);

select is(
  (
    select password_hash
    from public.admin_operators
    where id = '36000000-0000-0000-0000-000000000010'
  ),
  'test-only-hash',
  'stale password verification cannot overwrite a newer hash'
);

insert into public.games (
  id,
  game_date,
  game_time,
  home_team_id,
  away_team_id,
  game_status
)
values (
  360003,
  '2099-01-03',
  '18:00',
  1,
  2,
  'SCHEDULED'
);

select is(
  (
    public.admin_apply_game_data(
      '36000000-0000-0000-0000-000000000010',
      jsonb_build_object(
        'action',
        'save_games',
        'targetDate',
        '2099-01-04',
        'games',
        jsonb_build_array(
          jsonb_build_object(
            'id',
            360003,
            'game_date',
            '2099-01-04',
            'game_time',
            '18:00',
            'home_team_id',
            1,
            'away_team_id',
            2,
            'game_status',
            'SCHEDULED'
          )
        )
      ),
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'date replacement cannot move a game from another date'
);

select is(
  (
    select game_date::text
    from public.games
    where id = 360003
  ),
  '2099-01-03',
  'blocked cross-date update preserves the original date'
);

select has_trigger(
  'public',
  'games',
  'trg_lock_game_date_mutations',
  'all game writes share the date replacement advisory lock'
);

select * from finish();

rollback;

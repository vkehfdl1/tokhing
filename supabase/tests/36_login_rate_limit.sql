begin;

select plan(13);

select has_table(
  'public',
  'admin_login_rate_limits',
  'database-backed admin login throttling table exists'
);

select has_function(
  'public',
  'admin_begin_login_attempt',
  array['text', 'text', 'inet', 'text'],
  'atomic login-attempt reservation function exists'
);

select has_function(
  'public',
  'admin_fail_login_attempt',
  array['bigint', 'text'],
  'login failure finalizer exists'
);

select has_function(
  'public',
  'admin_complete_login',
  array[
    'uuid',
    'text',
    'text',
    'timestamp with time zone',
    'text',
    'bigint',
    'inet',
    'text'
  ],
  'login completion binds the reserved attempt to the session'
);

create temporary table login_attempt_results (
  attempt integer primary key,
  result jsonb not null
) on commit drop;

insert into login_attempt_results (attempt, result)
select
  attempt,
  public.admin_begin_login_attempt(
    'test-owner@127.0.0.1',
    'test-owner',
    '127.0.0.1',
    'pgTAP'
  )
from generate_series(1, 5) as attempt;

select ok(
  (
    select bool_and((result ->> 'allowed')::boolean)
    from login_attempt_results
  ),
  'the first five serialized attempts are admitted'
);

select is(
  (
    public.admin_begin_login_attempt(
      'test-owner@127.0.0.1',
      'test-owner',
      '127.0.0.1',
      'pgTAP'
    ) ->> 'allowed'
  )::boolean,
  false,
  'the sixth serialized attempt is blocked'
);

select is(
  (
    public.admin_fail_login_attempt(
      (
        select (result ->> 'attemptId')::bigint
        from login_attempt_results
        where attempt = 1
      ),
      '아이디 또는 비밀번호를 확인해주세요.'
    ) ->> 'success'
  )::boolean,
  true,
  'failed login finalization updates the reserved audit'
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
  '36000000-0000-0000-0000-000000000020',
  'test-owner',
  'Test Owner',
  'OWNER',
  'test-only-hash',
  false
);

select is(
  (
    public.admin_complete_login(
      '36000000-0000-0000-0000-000000000020',
      'test-only-hash',
      'test-session-token-hash',
      now() + interval '1 hour',
      'test-owner@127.0.0.1',
      (
        select (result ->> 'attemptId')::bigint
        from login_attempt_results
        where attempt = 2
      ),
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  true,
  'successful login atomically creates the session and clears throttle'
);

select is(
  (
    public.admin_begin_login_attempt(
      'test-owner@127.0.0.1',
      'test-owner',
      '127.0.0.1',
      'pgTAP'
    ) ->> 'allowed'
  )::boolean,
  true,
  'successful authentication clears the serialized throttle'
);

create temporary table ip_attempt_results (
  attempt integer primary key,
  result jsonb not null
) on commit drop;

insert into ip_attempt_results (attempt, result)
select
  attempt,
  public.admin_begin_login_attempt(
    'ignored-composite-key-' || attempt,
    'rotating-user-' || attempt,
    '10.20.30.40',
    'pgTAP'
  )
from generate_series(1, 5) as attempt;

select ok(
  (
    select bool_and((result ->> 'allowed')::boolean)
    from ip_attempt_results
  ),
  'five rotating usernames are admitted from one IP'
);

select is(
  (
    public.admin_begin_login_attempt(
      'ignored-composite-key-6',
      'rotating-user-6',
      '10.20.30.40',
      'pgTAP'
    ) ->> 'allowed'
  )::boolean,
  false,
  'IP throttle blocks username rotation'
);

select public.admin_begin_login_attempt(
  'ignored-composite-key-7',
  'rotating-user-7',
  '10.20.30.40',
  'pgTAP'
);

select is(
  (
    select count(*)::integer
    from public.admin_audit_logs
    where action = 'ADMIN_LOGIN_BLOCKED'
      and target_id = 'ip:10.20.30.0'
  ),
  1,
  'repeated blocked requests produce one bounded audit event per minute'
);

select is(
  (
    select count(*)::integer
    from public.admin_login_rate_limits
    where identity like 'account:rotating-user-%'
  ),
  0,
  'unknown username rotation does not create account throttle rows'
);

select * from finish();

rollback;

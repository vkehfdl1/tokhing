begin;

select plan(11);

select isnt(
  has_function_privilege(
    'anon',
    'public.get_weekly_coin_cron_status()',
    'execute'
  ),
  true,
  'anon cannot inspect the admin weekly cron RPC directly'
);

select isnt(
  has_function_privilege(
    'authenticated',
    'public.get_weekly_coin_cron_status()',
    'execute'
  ),
  true,
  'authenticated users cannot inspect the admin weekly cron RPC directly'
);

select has_function(
  'public',
  'admin_execute_rpc',
  array['uuid', 'text', 'jsonb', 'inet', 'text'],
  'atomic admin RPC wrapper exists'
);

select has_function(
  'public',
  'admin_apply_game_data',
  array['uuid', 'jsonb', 'inet', 'text'],
  'atomic game-data wrapper exists'
);

select has_function(
  'public',
  'admin_update_operator',
  array['uuid', 'uuid', 'jsonb', 'inet', 'text'],
  'serialized operator update wrapper exists'
);

select has_function(
  'public',
  'admin_create_operator',
  array['uuid', 'text', 'text', 'public.admin_role', 'text', 'inet', 'text'],
  'atomic operator creation wrapper exists'
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
  '36000000-0000-0000-0000-000000000001',
  'security_owner',
  'Security Owner',
  'OWNER',
  'test-only-hash',
  false
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
  '36000000-0000-0000-0000-000000000002',
  'temporary_operator',
  'Temporary Operator',
  'OPERATOR',
  'test-only-hash',
  true
);

select is(
  (
    public.admin_execute_rpc(
      '36000000-0000-0000-0000-000000000002',
      'get_weekly_coin_cron_status',
      '{}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'database mutation boundary rejects temporary-password operators'
);

select is(
  (
    public.admin_execute_rpc(
      '36000000-0000-0000-0000-000000000001',
      'get_weekly_coin_cron_status',
      '{}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  true,
  'atomic admin wrapper returns successful reads'
);

select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where operator_id = '36000000-0000-0000-0000-000000000001'
      and action = 'ADMIN_RPC_GET_WEEKLY_COIN_CRON_STATUS'
      and success
  ),
  'successful admin wrapper call commits its audit record'
);

select is(
  (
    public.admin_execute_rpc(
      '36000000-0000-0000-0000-000000000001',
      'unsupported_action',
      '{}'::jsonb,
      '127.0.0.1',
      'pgTAP'
    ) ->> 'success'
  )::boolean,
  false,
  'failed admin wrapper call returns a structured failure'
);

select ok(
  exists (
    select 1
    from public.admin_audit_logs
    where operator_id = '36000000-0000-0000-0000-000000000001'
      and action = 'ADMIN_RPC_UNSUPPORTED_ACTION'
      and not success
  ),
  'failed admin wrapper call commits its failure audit'
);

select * from finish();

rollback;

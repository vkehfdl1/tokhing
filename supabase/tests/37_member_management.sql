begin;

select plan(8);

select has_column('public', 'users', 'is_active', 'member active flag exists');
select has_column(
  'public',
  'users',
  'session_version',
  'member session version exists'
);
select has_function(
  'public',
  'admin_upsert_member',
  array['uuid', 'jsonb', 'boolean'],
  'atomic member upsert exists'
);
select has_function(
  'public',
  'admin_set_member_active',
  array['uuid', 'uuid', 'boolean', 'boolean', 'text'],
  'member activation workflow exists'
);
select has_function(
  'public',
  'admin_repair_member_wallet',
  array['uuid', 'uuid'],
  'wallet repair workflow exists'
);
select isnt(
  has_function_privilege(
    'anon',
    'public.admin_upsert_member(uuid,jsonb,boolean)',
    'execute'
  ),
  true,
  'anon cannot manage members'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.admin_upsert_member(uuid,jsonb,boolean)',
    'execute'
  ),
  'service role can manage members'
);
select ok(
  has_function_privilege(
    'anon',
    'public.validate_user_session(uuid,integer)',
    'execute'
  ),
  'client can validate its local session version'
);

select * from finish();

rollback;

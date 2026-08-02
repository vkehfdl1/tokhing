begin;

select plan(11);

select has_type('public', 'admin_role', 'admin role enum exists');
select has_table('public', 'admin_operators', 'admin operators table exists');
select has_table('public', 'admin_sessions', 'admin sessions table exists');
select has_table('public', 'admin_audit_logs', 'admin audit table exists');
select isnt(
  has_function_privilege('anon', 'public.activate_season(integer)', 'execute'),
  true,
  'anon cannot activate seasons'
);
select isnt(
  has_function_privilege('anon', 'public.admin_grant_coins(uuid,numeric)', 'execute'),
  true,
  'anon cannot adjust wallets'
);
select isnt(
  has_function_privilege('anon', 'public.settle_market(integer,text)', 'execute'),
  true,
  'anon cannot settle markets'
);
select ok(
  has_function_privilege('service_role', 'public.activate_season(integer)', 'execute'),
  'service role can activate seasons through the server boundary'
);
select ok(
  has_table_privilege('service_role', 'public.admin_audit_logs', 'insert'),
  'service role can append audit logs'
);
select isnt(
  has_table_privilege('anon', 'public.games', 'update'),
  true,
  'anon cannot update games directly'
);
select isnt(
  has_table_privilege('anon', 'public.teams', 'insert'),
  true,
  'anon cannot create teams directly'
);

select * from finish();

rollback;

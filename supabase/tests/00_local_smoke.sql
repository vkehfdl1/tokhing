begin;

select plan(4);

select is(current_database(), 'postgres', 'local test database is postgres');
select has_table('public', 'users', 'users table is migrated locally');
select has_table('public', 'seasons', 'seasons table is migrated locally');
select is(
  (select count(*)::integer from public.users),
  3,
  'local seed contains three deterministic users'
);

select * from finish();

rollback;

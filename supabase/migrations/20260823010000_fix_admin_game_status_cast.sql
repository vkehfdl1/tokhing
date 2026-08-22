-- Restore admin game saves after the admin operations migration referenced the
-- wrong case-sensitive PostgreSQL enum name.
--
-- The existing enum is public."GAME_STATUS". PostgreSQL resolves
-- public.game_status as a different, non-existent type.
--
-- This migration only replaces the function definition. It does not modify
-- games, markets, seasons, wallets, positions, orders, or transactions.
do $$
declare
  v_function regprocedure;
  v_definition text;
begin
  if to_regtype('public."GAME_STATUS"') is null then
    raise exception 'required enum public."GAME_STATUS" does not exist';
  end if;

  v_function := to_regprocedure(
    'public.admin_apply_game_data(uuid,jsonb,inet,text)'
  );

  if v_function is null then
    raise exception 'required function public.admin_apply_game_data does not exist';
  end if;

  select pg_get_functiondef(v_function)
  into v_definition;

  if strpos(v_definition, '::public.game_status') = 0 then
    if strpos(v_definition, '::public."GAME_STATUS"') > 0 then
      return;
    end if;

    raise exception 'admin_apply_game_data has an unexpected definition';
  end if;

  execute replace(
    v_definition,
    '::public.game_status',
    '::public."GAME_STATUS"'
  );
end;
$$;

-- Issue #37: atomic member lifecycle management.

alter table public.users
  add column if not exists is_active boolean not null default true,
  add column if not exists session_version integer not null default 1,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_reason text;

insert into public.settings (key, value)
values ('member_initial_grant', '{"amount": 1000}'::jsonb)
on conflict (key) do nothing;

create or replace function public.require_admin_operator(
  p_actor_id uuid,
  p_owner_only boolean default false
)
returns public.admin_role
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role public.admin_role;
begin
  select role
  into v_role
  from public.admin_operators
  where id = p_actor_id
    and is_active = true;

  if not found then
    raise exception '활성 운영자 권한을 확인할 수 없습니다';
  end if;

  if p_owner_only and v_role <> 'OWNER' then
    raise exception 'OWNER 권한이 필요합니다';
  end if;

  if not p_owner_only and v_role = 'VIEWER' then
    raise exception '변경 권한이 없습니다';
  end if;

  return v_role;
end;
$$;

create or replace function public.admin_upsert_member(
  p_actor_id uuid,
  p_member jsonb,
  p_reset_password boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before public.users%rowtype;
  v_after public.users%rowtype;
  v_student_number bigint;
  v_username text;
  v_phone text;
  v_department text;
  v_team_id integer;
  v_action text;
  v_active_season_id integer;
  v_initial_grant numeric;
  v_inserted_wallet_id uuid;
begin
  perform public.require_admin_operator(p_actor_id);

  if coalesce(p_member->>'student_number', '') !~ '^[0-9]+$' then
    raise exception '학번은 숫자만 입력해야 합니다';
  end if;
  v_student_number := (p_member->>'student_number')::bigint;
  v_username := btrim(coalesce(p_member->>'username', ''));
  v_phone := regexp_replace(coalesce(p_member->>'phone_number', ''), '[^0-9]', '', 'g');
  v_department := btrim(coalesce(p_member->>'department', ''));

  if coalesce(p_member->>'favorite_team_id', '') !~ '^[0-9]+$' then
    raise exception '선호팀을 선택해주세요';
  end if;
  v_team_id := (p_member->>'favorite_team_id')::integer;

  if v_username = '' then
    raise exception '이름은 필수입니다';
  end if;
  if v_department = '' then
    raise exception '학과는 필수입니다';
  end if;
  if v_phone !~ '^01[016789][0-9]{7,8}$' then
    raise exception '전화번호 형식이 올바르지 않습니다';
  end if;
  if not exists (select 1 from public.teams where id = v_team_id) then
    raise exception '선호팀 정보를 찾을 수 없습니다';
  end if;

  select *
  into v_before
  from public.users
  where student_number = v_student_number
  for update;

  if not found then
    insert into public.users (
      student_number,
      username,
      phone_number,
      department,
      type,
      favorite_team_id,
      password_hash,
      password_changed,
      is_active,
      session_version
    )
    values (
      v_student_number,
      v_username,
      v_phone,
      v_department,
      'STUDENT',
      v_team_id,
      encode(digest(v_phone, 'sha256'), 'hex'),
      false,
      true,
      1
    )
    returning * into v_after;
    v_action := 'CREATE';

    select id
    into v_active_season_id
    from public.seasons
    where status = 'ACTIVE'
    limit 1;

    if v_active_season_id is null then
      raise exception '활성 시즌을 찾을 수 없습니다';
    end if;

    select coalesce((value->>'amount')::numeric, 1000)
    into v_initial_grant
    from public.settings
    where key = 'member_initial_grant';
    v_initial_grant := coalesce(v_initial_grant, 1000);

    insert into public.wallets (
      user_id, season_id, balance, created_at, updated_at
    )
    values (
      v_after.id, v_active_season_id, v_initial_grant, now(), now()
    )
    on conflict (user_id, season_id) do nothing
    returning id into v_inserted_wallet_id;

    if v_inserted_wallet_id is not null then
      insert into public.transactions (
        user_id, type, amount, balance_after, reference_id,
        description, season_id
      )
      values (
        v_after.id, 'SEASON_GRANT', v_initial_grant, v_initial_grant, null,
        '신규 회원 시즌 시작 코인 지급', v_active_season_id
      );
    end if;
  else
    update public.users
    set
      username = v_username,
      phone_number = v_phone,
      department = v_department,
      favorite_team_id = v_team_id,
      password_hash = case
        when p_reset_password then encode(digest(v_phone, 'sha256'), 'hex')
        else password_hash
      end,
      password_changed = case
        when p_reset_password then false
        else password_changed
      end,
      session_version = case
        when p_reset_password then session_version + 1
        else session_version
      end,
      updated_at = now()
    where id = v_before.id
    returning * into v_after;
    v_action := 'UPDATE';
  end if;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_actor_id,
    'ADMIN_MEMBER_' || v_action,
    'user',
    v_after.id::text,
    case when v_action = 'UPDATE' then to_jsonb(v_before) else null end,
    to_jsonb(v_after) - 'password_hash',
    true
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'user_id', v_after.id,
    'student_number', v_after.student_number,
    'password_reset', p_reset_password,
    'wallet_created', v_inserted_wallet_id is not null
  );
end;
$$;

create or replace function public.admin_bulk_upsert_members(
  p_actor_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  perform public.require_admin_operator(p_actor_id);
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception '회원 일괄 데이터는 배열이어야 합니다';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_result := public.admin_upsert_member(
      p_actor_id,
      v_row,
      coalesce((v_row->>'reset_password')::boolean, false)
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, after_state, success
  )
  values (
    p_actor_id,
    'ADMIN_MEMBER_BULK_APPLY',
    'user',
    jsonb_build_object('results', v_results),
    true
  );

  return jsonb_build_object('success', true, 'results', v_results);
end;
$$;

create or replace function public.admin_member_impact(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'open_position_count',
    (
      select count(*)
      from public.positions p
      join public.markets m on m.id = p.market_id
      where p.user_id = p_user_id
        and p.quantity > 0
        and m.status in ('OPEN', 'CLOSED')
    ),
    'active_wallet_balance',
    (
      select w.balance
      from public.wallets w
      join public.seasons s on s.id = w.season_id and s.status = 'ACTIVE'
      where w.user_id = p_user_id
      limit 1
    ),
    'has_active_wallet',
    exists (
      select 1
      from public.wallets w
      join public.seasons s on s.id = w.season_id and s.status = 'ACTIVE'
      where w.user_id = p_user_id
    )
  );
$$;

create or replace function public.admin_set_member_active(
  p_actor_id uuid,
  p_user_id uuid,
  p_is_active boolean,
  p_confirm_open_positions boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_before public.users%rowtype;
  v_after public.users%rowtype;
  v_impact jsonb;
begin
  perform public.require_admin_operator(p_actor_id);
  select * into v_before from public.users where id = p_user_id for update;
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다';
  end if;

  v_impact := public.admin_member_impact(p_user_id);
  if not p_is_active
     and (v_impact->>'open_position_count')::integer > 0
     and not p_confirm_open_positions then
    raise exception '미정산 포지션이 있어 영향 확인이 필요합니다';
  end if;

  update public.users
  set
    is_active = p_is_active,
    session_version = session_version + 1,
    deactivated_at = case when p_is_active then null else now() end,
    deactivated_reason = case when p_is_active then null else p_reason end,
    updated_at = now()
  where id = p_user_id
  returning * into v_after;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_actor_id,
    case when p_is_active
      then 'ADMIN_MEMBER_REACTIVATED'
      else 'ADMIN_MEMBER_DEACTIVATED'
    end,
    'user',
    p_user_id::text,
    to_jsonb(v_before) - 'password_hash',
    jsonb_build_object(
      'member', to_jsonb(v_after) - 'password_hash',
      'impact', v_impact
    ),
    true
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'is_active', p_is_active,
    'session_version', v_after.session_version,
    'impact', v_impact
  );
end;
$$;

create or replace function public.admin_repair_member_wallet(
  p_actor_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.users%rowtype;
  v_season_id integer;
  v_initial_grant numeric;
  v_wallet_id uuid;
begin
  perform public.require_admin_operator(p_actor_id);
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception '회원 정보를 찾을 수 없습니다';
  end if;
  if not v_user.is_active then
    raise exception '비활성 회원의 지갑은 복구할 수 없습니다';
  end if;

  select id into v_season_id
  from public.seasons where status = 'ACTIVE' limit 1;
  if v_season_id is null then
    raise exception '활성 시즌이 없습니다';
  end if;

  select coalesce((value->>'amount')::numeric, 1000)
  into v_initial_grant
  from public.settings where key = 'member_initial_grant';
  v_initial_grant := coalesce(v_initial_grant, 1000);

  insert into public.wallets (
    user_id, season_id, balance, created_at, updated_at
  )
  values (p_user_id, v_season_id, v_initial_grant, now(), now())
  on conflict (user_id, season_id) do nothing
  returning id into v_wallet_id;

  if v_wallet_id is not null then
    insert into public.transactions (
      user_id, type, amount, balance_after, reference_id,
      description, season_id
    )
    values (
      p_user_id, 'SEASON_GRANT', v_initial_grant, v_initial_grant, null,
      '누락 활성 시즌 지갑 복구', v_season_id
    );
  end if;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id, after_state, success
  )
  values (
    p_actor_id,
    'ADMIN_MEMBER_WALLET_REPAIRED',
    'user',
    p_user_id::text,
    jsonb_build_object(
      'season_id', v_season_id,
      'created', v_wallet_id is not null,
      'initial_grant', v_initial_grant
    ),
    true
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'season_id', v_season_id,
    'created', v_wallet_id is not null,
    'initial_grant', v_initial_grant
  );
end;
$$;

create or replace function public.login(
  p_student_number bigint,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user record;
  v_input_hash text;
  v_active public.seasons%rowtype;
  v_inserted_wallet_id uuid;
  v_initial_grant numeric;
begin
  select
    id, username, password_hash, password_changed,
    is_active, session_version
  into v_user
  from public.users
  where student_number = p_student_number
  limit 1;

  v_input_hash := encode(digest(coalesce(p_password, ''), 'sha256'), 'hex');
  if not found
     or not v_user.is_active
     or v_user.password_hash is null
     or v_user.password_hash <> v_input_hash then
    return jsonb_build_object(
      'success', false,
      'error', '학번 또는 비밀번호가 올바르지 않습니다'
    );
  end if;

  select * into v_active
  from public.seasons where status = 'ACTIVE' limit 1;
  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'login 처리 중 활성 시즌을 찾을 수 없습니다'
    );
  end if;

  select coalesce((value->>'amount')::numeric, 1000)
  into v_initial_grant
  from public.settings where key = 'member_initial_grant';
  v_initial_grant := coalesce(v_initial_grant, 1000);

  insert into public.wallets (user_id, season_id, balance, created_at, updated_at)
  values (v_user.id, v_active.id, v_initial_grant, now(), now())
  on conflict (user_id, season_id) do nothing
  returning id into v_inserted_wallet_id;

  if v_inserted_wallet_id is not null then
    insert into public.transactions (
      user_id, type, amount, balance_after, reference_id,
      description, created_at, season_id
    )
    values (
      v_user.id, 'SEASON_GRANT', v_initial_grant, v_initial_grant, null,
      '시즌 시작 코인 지급', now(), v_active.id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user.id,
    'username', v_user.username,
    'password_changed', coalesce(v_user.password_changed, false),
    'session_version', v_user.session_version
  );
end;
$$;

create or replace function public.validate_user_session(
  p_user_id uuid,
  p_session_version integer
)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select case
    when exists (
      select 1
      from public.users
      where id = p_user_id
        and is_active = true
        and session_version = p_session_version
    )
    then jsonb_build_object('success', true, 'valid', true)
    else jsonb_build_object('success', true, 'valid', false)
  end;
$$;

do $$
begin
  if to_regprocedure(
    'public.execute_buy_order_unchecked(uuid,integer,text,numeric)'
  ) is null then
    alter function public.execute_buy_order(uuid, integer, text, numeric)
      rename to execute_buy_order_unchecked;
  end if;
  if to_regprocedure(
    'public.execute_sell_order_unchecked(uuid,integer,text,numeric)'
  ) is null then
    alter function public.execute_sell_order(uuid, integer, text, numeric)
      rename to execute_sell_order_unchecked;
  end if;
end;
$$;

create or replace function public.execute_buy_order(
  p_user_id uuid,
  p_market_id integer,
  p_outcome text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and is_active = true
  ) then
    return jsonb_build_object(
      'success', false,
      'error', '비활성 회원은 거래할 수 없습니다'
    );
  end if;
  return public.execute_buy_order_unchecked(
    p_user_id, p_market_id, p_outcome, p_quantity
  );
end;
$$;

create or replace function public.execute_sell_order(
  p_user_id uuid,
  p_market_id integer,
  p_outcome text,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and is_active = true
  ) then
    return jsonb_build_object(
      'success', false,
      'error', '비활성 회원은 거래할 수 없습니다'
    );
  end if;
  return public.execute_sell_order_unchecked(
    p_user_id, p_market_id, p_outcome, p_quantity
  );
end;
$$;

create or replace function public.distribute_weekly_coins(
  p_amount numeric default 300
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season_id integer;
  v_users_count integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception '지급 코인은 0보다 커야 합니다';
  end if;
  select id into v_season_id
  from public.seasons where status = 'ACTIVE' limit 1;
  if v_season_id is null then
    raise exception '활성 시즌이 없어 주간 코인을 지급할 수 없습니다';
  end if;

  insert into public.wallets (user_id, season_id, balance, created_at, updated_at)
  select id, v_season_id, 0, now(), now()
  from public.users
  where is_active = true
  on conflict (user_id, season_id) do nothing;

  with updated_wallets as (
    update public.wallets w
    set balance = w.balance + p_amount, updated_at = now()
    from public.users u
    where u.id = w.user_id
      and u.is_active = true
      and w.season_id = v_season_id
    returning w.user_id, w.balance
  ), inserted_transactions as (
    insert into public.transactions (
      user_id, type, amount, balance_after, reference_id,
      description, season_id
    )
    select
      user_id, 'WEEKLY_GRANT', p_amount, balance, null,
      '주간 코인 지급', v_season_id
    from updated_wallets
    returning user_id
  )
  select count(*) into v_users_count from inserted_transactions;

  return jsonb_build_object(
    'success', true,
    'users_count', v_users_count,
    'total_distributed', v_users_count * p_amount
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

create or replace function public.admin_grant_coins(
  p_user_id uuid,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season_id integer;
  v_wallet public.wallets%rowtype;
  v_new_balance numeric;
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and is_active = true
  ) then
    raise exception '비활성 회원에게는 코인을 지급할 수 없습니다';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception '지급 코인은 0보다 커야 합니다';
  end if;
  select id into v_season_id
  from public.seasons where status = 'ACTIVE' limit 1;
  if v_season_id is null then
    raise exception '활성 시즌이 없습니다';
  end if;

  insert into public.wallets (user_id, season_id, balance, created_at, updated_at)
  values (p_user_id, v_season_id, 0, now(), now())
  on conflict (user_id, season_id) do nothing;

  select * into v_wallet
  from public.wallets
  where user_id = p_user_id and season_id = v_season_id
  for update;
  v_new_balance := v_wallet.balance + p_amount;

  update public.wallets
  set balance = v_new_balance, updated_at = now()
  where id = v_wallet.id;
  insert into public.transactions (
    user_id, type, amount, balance_after, reference_id,
    description, season_id
  )
  values (
    p_user_id, 'ADMIN_GRANT', p_amount, v_new_balance, null,
    '관리자 코인 지급', v_season_id
  );

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'granted_amount', p_amount,
    'new_balance', v_new_balance
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

create or replace function public.activate_season(p_season_id integer)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_target public.seasons%rowtype;
  v_previous_active_id integer;
  v_open_market_count integer;
  v_users_granted integer;
  v_grant_amount numeric;
begin
  select * into v_target
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '활성화할 시즌을 찾을 수 없습니다';
  end if;
  if v_target.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 활성화할 수 있습니다';
  end if;
  if v_target.start_date >= v_target.end_date then
    raise exception '시즌 시작일은 종료일보다 빨라야 합니다';
  end if;

  select id into v_previous_active_id
  from public.seasons
  where status = 'ACTIVE'
  for update;

  if v_previous_active_id is not null then
    select count(*) into v_open_market_count
    from public.markets
    where season_id = v_previous_active_id
      and status in ('OPEN', 'CLOSED');
    if v_open_market_count > 0 then
      raise exception '이전 시즌에 미정산 마켓 %개가 있어 새 시즌을 시작할 수 없습니다',
        v_open_market_count;
    end if;

    update public.seasons
    set status = 'ARCHIVED', updated_at = now()
    where id = v_previous_active_id;
  end if;

  update public.seasons
  set status = 'ACTIVE', updated_at = now()
  where id = p_season_id;

  select coalesce((value->>'amount')::numeric, 1000)
  into v_grant_amount
  from public.settings where key = 'member_initial_grant';
  v_grant_amount := coalesce(v_grant_amount, 1000);

  insert into public.wallets (user_id, season_id, balance, created_at, updated_at)
  select id, p_season_id, v_grant_amount, now(), now()
  from public.users
  where is_active = true
  on conflict (user_id, season_id) do nothing;

  insert into public.transactions (
    user_id, type, amount, balance_after, reference_id,
    description, created_at, season_id
  )
  select
    u.id, 'SEASON_GRANT', v_grant_amount, w.balance, p_season_id,
    format('%s 시작 코인 지급', v_target.name), now(), p_season_id
  from public.users u
  join public.wallets w
    on w.user_id = u.id
   and w.season_id = p_season_id
  where u.is_active = true
    and not exists (
      select 1
      from public.transactions t
      where t.user_id = u.id
        and t.season_id = p_season_id
        and t.type = 'SEASON_GRANT'
    );
  get diagnostics v_users_granted = row_count;

  return jsonb_build_object(
    'success', true,
    'activated_season_id', p_season_id,
    'archived_season_id', v_previous_active_id,
    'users_granted', v_users_granted,
    'grant_amount', v_grant_amount
  );
end;
$$;

revoke execute on function public.require_admin_operator(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function public.admin_upsert_member(uuid, jsonb, boolean)
  from public, anon, authenticated;
revoke execute on function public.admin_bulk_upsert_members(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.admin_member_impact(uuid)
  from public, anon, authenticated;
revoke execute on function public.admin_set_member_active(
  uuid, uuid, boolean, boolean, text
) from public, anon, authenticated;
revoke execute on function public.admin_repair_member_wallet(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.require_admin_operator(uuid, boolean)
  to service_role;
grant execute on function public.admin_upsert_member(uuid, jsonb, boolean)
  to service_role;
grant execute on function public.admin_bulk_upsert_members(uuid, jsonb)
  to service_role;
grant execute on function public.admin_member_impact(uuid)
  to service_role;
grant execute on function public.admin_set_member_active(
  uuid, uuid, boolean, boolean, text
) to service_role;
grant execute on function public.admin_repair_member_wallet(uuid, uuid)
  to service_role;

grant execute on function public.login(bigint, text)
  to anon, authenticated, service_role;
grant execute on function public.validate_user_session(uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.execute_buy_order(uuid, integer, text, numeric)
  to anon, authenticated, service_role;
grant execute on function public.execute_sell_order(uuid, integer, text, numeric)
  to anon, authenticated, service_role;
grant execute on function public.distribute_weekly_coins(numeric)
  to service_role;
grant execute on function public.admin_grant_coins(uuid, numeric)
  to service_role;
revoke execute on function public.activate_season(integer)
  from public, anon, authenticated;
grant execute on function public.activate_season(integer)
  to service_role;

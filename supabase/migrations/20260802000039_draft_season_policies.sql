-- Issue #39: governed DRAFT editing/deletion and configurable atomic grants.

alter table public.seasons
  add column if not exists initial_grant_amount numeric not null default 1000;

alter table public.seasons
  drop constraint if exists seasons_initial_grant_amount_check;

alter table public.seasons
  add constraint seasons_initial_grant_amount_check
  check (initial_grant_amount > 0);

create or replace function public.assert_valid_season_draft(
  p_excluded_season_id integer,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_initial_grant_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if btrim(coalesce(p_name, '')) = '' then
    raise exception '시즌 이름을 입력해주세요';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception '시작일과 종료일을 모두 입력해주세요';
  end if;
  if p_start_date >= p_end_date then
    raise exception '시작일은 종료일보다 빨라야 합니다';
  end if;
  if p_initial_grant_amount is null or p_initial_grant_amount <= 0 then
    raise exception '초기 지급액은 0보다 커야 합니다';
  end if;
  if exists (
    select 1
    from public.seasons s
    where s.id is distinct from p_excluded_season_id
      and s.start_date is not null
      and s.end_date is not null
      and daterange(s.start_date, s.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')
  ) then
    raise exception '다른 시즌 기간과 겹칩니다';
  end if;
end;
$$;

create or replace function public.admin_create_draft_season(
  p_operator_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_initial_grant_amount numeric
)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  perform public.assert_valid_season_draft(
    null,
    p_name,
    p_start_date,
    p_end_date,
    p_initial_grant_amount
  );

  if exists (select 1 from public.seasons where status = 'DRAFT') then
    raise exception '이미 DRAFT 시즌이 존재합니다';
  end if;

  insert into public.seasons (
    name,
    start_date,
    end_date,
    status,
    initial_grant_amount
  )
  values (
    btrim(p_name),
    p_start_date,
    p_end_date,
    'DRAFT',
    p_initial_grant_amount
  )
  returning * into v_season;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_DRAFT_CREATE',
    'season',
    v_season.id::text,
    to_jsonb(v_season),
    true
  );

  return v_season;
end;
$$;

create or replace function public.admin_update_draft_season(
  p_operator_id uuid,
  p_season_id integer,
  p_name text,
  p_start_date date,
  p_end_date date,
  p_initial_grant_amount numeric
)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.seasons;
  v_season public.seasons;
begin
  select *
  into v_before
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_before.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 수정할 수 있습니다';
  end if;

  perform public.assert_valid_season_draft(
    p_season_id,
    p_name,
    p_start_date,
    p_end_date,
    p_initial_grant_amount
  );

  update public.seasons
  set name = btrim(p_name),
      start_date = p_start_date,
      end_date = p_end_date,
      initial_grant_amount = p_initial_grant_amount
  where id = p_season_id
  returning * into v_season;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_DRAFT_UPDATE',
    'season',
    v_season.id::text,
    to_jsonb(v_before),
    to_jsonb(v_season),
    true
  );

  return v_season;
end;
$$;

create or replace function public.get_draft_season_delete_impact(
  p_season_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_season.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 삭제할 수 있습니다';
  end if;

  return jsonb_build_object(
    'season_id', v_season.id,
    'season_name', v_season.name,
    'linked_matches', (
      select count(distinct game_id)
      from public.markets
      where season_id = v_season.id
    ),
    'linked_markets', (
      select count(*)
      from public.markets
      where season_id = v_season.id
    )
  );
end;
$$;

create or replace function public.admin_delete_draft_season(
  p_operator_id uuid,
  p_season_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_impact jsonb;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_season.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 삭제할 수 있습니다';
  end if;

  v_impact := public.get_draft_season_delete_impact(p_season_id);
  if (v_impact->>'linked_matches')::integer > 0
    or (v_impact->>'linked_markets')::integer > 0 then
    raise exception '연결된 경기 또는 마켓이 있어 DRAFT 시즌을 삭제할 수 없습니다';
  end if;

  delete from public.seasons where id = p_season_id;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_DRAFT_DELETE',
    'season',
    p_season_id::text,
    to_jsonb(v_season),
    v_impact,
    true
  );

  return v_impact;
end;
$$;

create or replace function public.get_season_activation_preview(
  p_season_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_eligible_members integer;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_season.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 활성화할 수 있습니다';
  end if;

  select count(*) into v_eligible_members from public.users;

  return jsonb_build_object(
    'season_id', v_season.id,
    'season_name', v_season.name,
    'initial_grant_amount', v_season.initial_grant_amount,
    'eligible_members', v_eligible_members,
    'total_planned_grant',
      v_eligible_members * v_season.initial_grant_amount
  );
end;
$$;

create or replace function public.admin_activate_season(
  p_operator_id uuid,
  p_season_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.seasons;
  v_active public.seasons;
  v_pending_count integer;
  v_preview jsonb;
  v_wallet_count integer;
  v_grant_count integer;
begin
  select *
  into v_target
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_target.status <> 'DRAFT' then
    raise exception 'DRAFT 시즌만 활성화할 수 있습니다';
  end if;
  if v_target.initial_grant_amount <= 0 then
    raise exception '초기 지급액은 0보다 커야 합니다';
  end if;

  if exists (
    select 1 from public.wallets where season_id = v_target.id
  ) or exists (
    select 1
    from public.transactions
    where season_id = v_target.id and type = 'SEASON_GRANT'
  ) then
    raise exception 'DRAFT 시즌에 초기 지급 데이터가 이미 존재합니다';
  end if;

  select *
  into v_active
  from public.seasons
  where status = 'ACTIVE'
  for update;

  if found then
    select count(*)
    into v_pending_count
    from public.markets
    where season_id = v_active.id
      and status in ('OPEN', 'CLOSED');

    if v_pending_count > 0 then
      raise exception '이전 시즌에 정산되지 않은 마켓이 %개 있습니다',
        v_pending_count;
    end if;
  end if;

  v_preview := public.get_season_activation_preview(v_target.id);

  if v_active.id is not null then
    update public.seasons
    set status = 'ARCHIVED',
        end_date = coalesce(end_date, v_target.start_date - 1)
    where id = v_active.id;
  end if;

  update public.seasons
  set status = 'ACTIVE'
  where id = v_target.id;

  insert into public.wallets (
    user_id, season_id, balance, created_at, updated_at
  )
  select
    u.id,
    v_target.id,
    v_target.initial_grant_amount,
    now(),
    now()
  from public.users u;
  get diagnostics v_wallet_count = row_count;

  insert into public.transactions (
    user_id,
    season_id,
    type,
    amount,
    balance_after,
    description,
    created_at
  )
  select
    u.id,
    v_target.id,
    'SEASON_GRANT',
    v_target.initial_grant_amount,
    v_target.initial_grant_amount,
    '시즌 시작 코인 지급',
    now()
  from public.users u;
  get diagnostics v_grant_count = row_count;

  if v_wallet_count <> v_grant_count then
    raise exception '시즌 지갑과 지급 기록 수가 일치하지 않습니다';
  end if;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_ACTIVATE',
    'season',
    v_target.id::text,
    jsonb_build_object('target', to_jsonb(v_target), 'preview', v_preview),
    jsonb_build_object(
      'status', 'ACTIVE',
      'wallets_created', v_wallet_count,
      'grants_created', v_grant_count
    ),
    true
  );

  return v_preview || jsonb_build_object(
    'success', true,
    'users_granted', v_grant_count
  );
end;
$$;

revoke all on function public.assert_valid_season_draft(
  integer, text, date, date, numeric
) from public, anon, authenticated;
revoke all on function public.admin_create_draft_season(
  uuid, text, date, date, numeric
) from public, anon, authenticated;
revoke all on function public.admin_update_draft_season(
  uuid, integer, text, date, date, numeric
) from public, anon, authenticated;
revoke all on function public.get_draft_season_delete_impact(integer)
  from public, anon, authenticated;
revoke all on function public.admin_delete_draft_season(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_season_activation_preview(integer)
  from public, anon, authenticated;
revoke all on function public.admin_activate_season(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.admin_create_draft_season(
  uuid, text, date, date, numeric
) to service_role;
grant execute on function public.admin_update_draft_season(
  uuid, integer, text, date, date, numeric
) to service_role;
grant execute on function public.get_draft_season_delete_impact(integer)
  to service_role;
grant execute on function public.admin_delete_draft_season(uuid, integer)
  to service_role;
grant execute on function public.get_season_activation_preview(integer)
  to service_role;
grant execute on function public.admin_activate_season(uuid, integer)
  to service_role;

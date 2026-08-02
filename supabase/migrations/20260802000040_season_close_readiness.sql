-- Issue #40: season close readiness, impact preview, and idempotent bulk processing.

create or replace function public.get_season_close_readiness(
  p_season_id integer,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 1000);
  v_unsettled integer;
  v_items jsonb;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;

  select count(*)
  into v_unsettled
  from public.markets
  where season_id = p_season_id
    and status in ('OPEN', 'CLOSED');

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.game_date, rows.market_id), '[]'::jsonb)
  into v_items
  from (
    select
      m.id as market_id,
      m.status::text as market_status,
      g.id as game_id,
      g.game_date,
      g.game_status::text as game_status,
      g.home_score,
      g.away_score,
      (
        select count(distinct p.user_id)
        from public.positions p
        where p.market_id = m.id and p.quantity > 0
      )::integer as position_holder_count,
      case
        when g.game_status = 'CANCELED' then 'CANCELLATION_RECOMMENDED'
        when g.game_status = 'FINISHED'
          and g.home_score is not null
          and g.away_score is not null then 'AUTO_DECIDABLE'
        else 'MANUAL_REVIEW'
      end as classification,
      case
        when g.game_status = 'FINISHED'
          and g.home_score is not null
          and g.away_score is not null
          and g.home_score > g.away_score then 'HOME'
        when g.game_status = 'FINISHED'
          and g.home_score is not null
          and g.away_score is not null
          and g.home_score < g.away_score then 'AWAY'
        when g.game_status = 'FINISHED'
          and g.home_score is not null
          and g.away_score is not null then 'DRAW'
        else null
      end as proposed_result,
      coalesce((
        select sum(p.quantity * 100)
        from public.positions p
        where p.market_id = m.id
          and p.quantity > 0
          and p.outcome = case
            when g.game_status = 'FINISHED'
              and g.home_score > g.away_score then 'HOME'
            when g.game_status = 'FINISHED'
              and g.home_score < g.away_score then 'AWAY'
            when g.game_status = 'FINISHED' then 'DRAW'
            else ''
          end
      ), 0) as estimated_payout,
      coalesce((
        select sum(p.quantity * p.avg_entry_price)
        from public.positions p
        where p.market_id = m.id and p.quantity > 0
      ), 0) as estimated_refund,
      case
        when g.game_status = 'CANCELED' then array['CANCEL']::text[]
        when m.status = 'OPEN' then array['CLOSE', 'SETTLE', 'CANCEL']::text[]
        else array['SETTLE', 'CANCEL']::text[]
      end as eligible_actions
    from public.markets m
    join public.games g on g.id = m.game_id
    where m.season_id = p_season_id
      and m.status in ('OPEN', 'CLOSED')
    order by g.game_date, m.id
    offset (v_page - 1) * v_page_size
    limit v_page_size
  ) rows;

  return jsonb_build_object(
    'season_id', v_season.id,
    'season_name', v_season.name,
    'season_status', v_season.status,
    'status_counts', jsonb_build_object(
      'OPEN', (
        select count(*) from public.markets
        where season_id = p_season_id and status = 'OPEN'
      ),
      'CLOSED', (
        select count(*) from public.markets
        where season_id = p_season_id and status = 'CLOSED'
      ),
      'CANCELED', (
        select count(*) from public.markets
        where season_id = p_season_id and status = 'CANCELED'
      ),
      'SETTLED', (
        select count(*) from public.markets
        where season_id = p_season_id and status = 'SETTLED'
      )
    ),
    'unsettled_count', v_unsettled,
    'closure_available', v_season.status = 'ACTIVE' and v_unsettled = 0,
    'next_activation_available', v_unsettled = 0,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', greatest(ceil(v_unsettled::numeric / v_page_size)::integer, 1),
    'items', v_items
  );
end;
$$;

create or replace function public.admin_process_season_markets(
  p_operator_id uuid,
  p_season_id integer,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season public.seasons;
  v_item jsonb;
  v_market public.markets;
  v_game public.games;
  v_market_id integer;
  v_action text;
  v_result text;
  v_rpc jsonb;
  v_before jsonb;
  v_after jsonb;
  v_results jsonb := '[]'::jsonb;
  v_before_rows jsonb := '[]'::jsonb;
  v_after_rows jsonb := '[]'::jsonb;
  v_success_count integer := 0;
  v_failure_count integer := 0;
  v_outcome_status text;
  v_message text;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_season.status <> 'ACTIVE' then
    raise exception 'ACTIVE 시즌의 마켓만 처리할 수 있습니다';
  end if;
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception '처리할 마켓을 선택해주세요';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_market_id := nullif(v_item->>'market_id', '')::integer;
    v_action := upper(btrim(coalesce(v_item->>'action', '')));
    v_result := upper(btrim(coalesce(v_item->>'result', '')));
    v_before := null;
    v_after := null;
    v_rpc := null;
    v_outcome_status := 'SUCCESS';
    v_message := '처리 완료';

    begin
      if v_action not in ('CLOSE', 'SETTLE', 'CANCEL') then
        raise exception '지원하지 않는 처리 작업입니다';
      end if;

      select *
      into v_market
      from public.markets
      where id = v_market_id and season_id = p_season_id
      for update;

      if not found then
        raise exception '시즌에 속한 마켓을 찾을 수 없습니다';
      end if;

      select *
      into v_game
      from public.games
      where id = v_market.game_id;

      v_before := to_jsonb(v_market);
      v_before_rows := v_before_rows || jsonb_build_array(v_before);

      if v_action = 'CLOSE' and v_market.status = 'CLOSED' then
        v_outcome_status := 'SKIPPED';
        v_message := '이미 종료된 마켓입니다';
      elsif v_action = 'SETTLE' and v_market.status = 'SETTLED' then
        v_outcome_status := 'SKIPPED';
        v_message := '이미 정산된 마켓입니다';
      elsif v_action = 'CANCEL' and v_market.status = 'CANCELED' then
        v_outcome_status := 'SKIPPED';
        v_message := '이미 취소된 마켓입니다';
      elsif v_market.status in ('SETTLED', 'CANCELED') then
        raise exception '완료된 마켓에는 다른 작업을 실행할 수 없습니다';
      elsif v_game.game_status = 'CANCELED' and v_action <> 'CANCEL' then
        raise exception '취소 경기는 CANCEL만 실행할 수 있습니다';
      elsif v_action = 'CLOSE' then
        v_rpc := public.close_market(v_market.id);
        if not coalesce((v_rpc->>'success')::boolean, false) then
          raise exception '%', coalesce(v_rpc->>'error', '마켓 종료 실패');
        end if;
      elsif v_action = 'CANCEL' then
        v_rpc := public.cancel_market(v_market.id);
        if not coalesce((v_rpc->>'success')::boolean, false) then
          raise exception '%', coalesce(v_rpc->>'error', '마켓 취소 실패');
        end if;
      else
        if v_result not in ('HOME', 'AWAY', 'DRAW') then
          if v_game.game_status = 'FINISHED'
            and v_game.home_score is not null
            and v_game.away_score is not null then
            v_result := case
              when v_game.home_score > v_game.away_score then 'HOME'
              when v_game.home_score < v_game.away_score then 'AWAY'
              else 'DRAW'
            end;
          else
            raise exception '수동 검토 마켓은 정산 결과를 선택해야 합니다';
          end if;
        end if;

        if v_market.status = 'OPEN' then
          v_rpc := public.close_market(v_market.id);
          if not coalesce((v_rpc->>'success')::boolean, false) then
            raise exception '%', coalesce(v_rpc->>'error', '마켓 종료 실패');
          end if;
        end if;

        v_rpc := public.settle_market(v_market.id, v_result);
        if not coalesce((v_rpc->>'success')::boolean, false) then
          raise exception '%', coalesce(v_rpc->>'error', '마켓 정산 실패');
        end if;
      end if;

      select to_jsonb(m)
      into v_after
      from public.markets m
      where m.id = v_market_id;
      v_after_rows := v_after_rows || jsonb_build_array(v_after);
      v_success_count := v_success_count + 1;
    exception
      when others then
        v_outcome_status := 'FAILURE';
        v_message := sqlerrm;
        select to_jsonb(m)
        into v_after
        from public.markets m
        where m.id = v_market_id;
        if v_after is not null then
          v_after_rows := v_after_rows || jsonb_build_array(v_after);
        end if;
        v_failure_count := v_failure_count + 1;
    end;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'market_id', v_market_id,
      'action', v_action,
      'result', nullif(v_result, ''),
      'status', v_outcome_status,
      'message', v_message,
      'before', v_before,
      'after', v_after,
      'rpc_result', v_rpc
    ));
  end loop;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_MARKET_BULK_PROCESS',
    'season',
    p_season_id::text,
    jsonb_build_object('inputs', p_items, 'markets', v_before_rows),
    jsonb_build_object('results', v_results, 'markets', v_after_rows),
    v_failure_count = 0
  );

  return jsonb_build_object(
    'season_id', p_season_id,
    'success_count', v_success_count,
    'failure_count', v_failure_count,
    'results', v_results,
    'readiness', public.get_season_close_readiness(
      p_season_id, 1, 20
    )
  );
end;
$$;

create or replace function public.admin_close_ready_season(
  p_operator_id uuid,
  p_season_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.seasons;
  v_readiness jsonb;
  v_result jsonb;
begin
  select *
  into v_before
  from public.seasons
  where id = p_season_id
  for update;

  if not found then
    raise exception '시즌을 찾을 수 없습니다';
  end if;
  if v_before.status <> 'ACTIVE' then
    raise exception 'ACTIVE 시즌만 종료할 수 있습니다';
  end if;

  v_readiness := public.get_season_close_readiness(
    p_season_id, 1, 1
  );
  if (v_readiness->>'unsettled_count')::integer <> 0 then
    raise exception '미정산 마켓이 남아 있어 시즌을 종료할 수 없습니다';
  end if;

  v_result := public.end_season(p_season_id);
  if not coalesce((v_result->>'success')::boolean, false) then
    raise exception '%', coalesce(v_result->>'error', '시즌 종료 실패');
  end if;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id,
    before_state, after_state, success
  )
  values (
    p_operator_id,
    'SEASON_CLOSE',
    'season',
    p_season_id::text,
    to_jsonb(v_before),
    v_result,
    true
  );

  return v_result || jsonb_build_object(
    'readiness_before_close', v_readiness
  );
end;
$$;

revoke all on function public.get_season_close_readiness(
  integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.admin_process_season_markets(
  uuid, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.admin_close_ready_season(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.get_season_close_readiness(
  integer, integer, integer
) to service_role;
grant execute on function public.admin_process_season_markets(
  uuid, integer, jsonb
) to service_role;
grant execute on function public.admin_close_ready_season(uuid, integer)
  to service_role;

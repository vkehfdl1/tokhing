-- Admin ops bugfixes (function-only, additive).
--
-- Fixes three defects found while writing the operator manual:
--   1) get_weekly_grant_status() called public.weekly_grant_next_run(), which was
--      never created -> "코인 지급 관리" 화면 전체가 400으로 죽음.
--   2) /api/admin/operations-search read public.users, which is RLS-locked and not
--      granted to anon -> "운영 현황 조회" 화면이 500 (permission denied for table users).
--   3) settle_market() never wrote settlement_events, so preview_settlement_recovery()
--      always returned null and 정산을 되돌릴 방법이 없었음.
--
-- Intentionally does NOT touch season/wallet/market/order/position/transaction rows.
-- No DML on operating data: this migration only creates or replaces functions.

-- ---------------------------------------------------------------------------
-- 1) weekly_grant_next_run: 다음 자동 지급 시각(KST 기준)을 timestamptz 로 계산
-- ---------------------------------------------------------------------------
create or replace function public.weekly_grant_next_run(
  p_weekday integer,
  p_grant_time time
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_kst_now timestamp;
  v_current_dow integer;
  v_days_ahead integer;
  v_candidate timestamp;
begin
  if p_weekday is null or p_grant_time is null then
    return null;
  end if;

  if p_weekday not between 1 and 7 then
    raise exception '요일은 1(월)부터 7(일) 사이여야 합니다';
  end if;

  v_kst_now := (now() at time zone 'Asia/Seoul');
  v_current_dow := extract(isodow from v_kst_now)::integer;
  v_days_ahead := (p_weekday - v_current_dow + 7) % 7;
  v_candidate := date_trunc('day', v_kst_now)
    + (v_days_ahead || ' days')::interval
    + p_grant_time;

  if v_candidate <= v_kst_now then
    v_candidate := v_candidate + interval '7 days';
  end if;

  return v_candidate at time zone 'Asia/Seoul';
end;
$$;

grant execute on function public.weekly_grant_next_run(integer, time)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) get_operations_overview: 운영 현황 조회 전용 읽기 RPC
--    users 테이블 직접 조회 대신 SECURITY DEFINER 로 감싸고,
--    users_public 이 이미 노출하는 컬럼(학번/이름)만 반환한다.
--    학과/전화번호 같은 개인정보는 반환하지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.get_operations_overview(
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
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer;
  v_total integer;
  v_users jsonb;
  v_open_finished integer;
begin
  v_offset := (v_page - 1) * v_page_size;

  select count(*)
  into v_total
  from public.wallets w
  where w.season_id = p_season_id;

  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.student_number), '[]'::jsonb)
  into v_users
  from (
    select
      u.id,
      u.student_number,
      u.username,
      w.balance,
      (
        select count(*) from public.orders o
        where o.user_id = u.id and o.season_id = p_season_id
      ) as order_count,
      (
        select count(*) from public.positions p
        where p.user_id = u.id and p.season_id = p_season_id and p.quantity > 0
      ) as position_count,
      (
        select count(*) from public.transactions t
        where t.user_id = u.id and t.season_id = p_season_id
      ) as transaction_count
    from public.wallets w
    join public.users u on u.id = w.user_id
    where w.season_id = p_season_id
    order by u.student_number
    limit v_page_size
    offset v_offset
  ) rows;

  select count(*)
  into v_open_finished
  from public.markets m
  join public.games g on g.id = m.game_id
  where m.season_id = p_season_id
    and m.status = 'OPEN'
    and g.game_status = 'FINISHED';

  return jsonb_build_object(
    'season_id', p_season_id,
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'users', v_users,
    'open_finished', v_open_finished
  );
end;
$$;

grant execute on function public.get_operations_overview(integer, integer, integer)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) settle_market: 정산 시 되돌리기용 스냅샷을 settlement_events 에 기록
--    (기존 20260718000000 버전과 동작 동일 + 스냅샷 저장만 추가)
-- ---------------------------------------------------------------------------
create or replace function public.settle_market(
  p_market_id integer,
  p_result text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result text;
  v_market public.markets%rowtype;
  v_game public.games%rowtype;
  v_active_season_id integer;
  v_user_payout record;
  v_wallet public.wallets%rowtype;
  v_new_balance numeric;
  v_total_users_settled integer := 0;
  v_total_coins_distributed numeric := 0;
  v_position_snapshot jsonb;
  v_payout_snapshot jsonb := '[]'::jsonb;
  v_transaction_id integer;
begin
  v_result := upper(btrim(coalesce(p_result, '')));

  if v_result not in ('HOME', 'AWAY', 'DRAW') then
    raise exception '정산 결과는 HOME, AWAY, DRAW 중 하나여야 합니다';
  end if;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '마켓을 찾을 수 없습니다';
  end if;

  if v_market.status = 'SETTLED' then
    raise exception '이미 정산된 마켓입니다';
  end if;

  if v_market.status = 'CANCELED' then
    raise exception '취소된 마켓은 정산할 수 없습니다';
  end if;

  select * into v_game
  from public.games
  where id = v_market.game_id
  for update;

  if not found then
    raise exception '마켓에 연결된 경기를 찾을 수 없습니다';
  end if;

  if upper(btrim(coalesce(v_game.game_status::text, ''))) = 'CANCELED' then
    raise exception '취소된 경기는 정산할 수 없습니다. 마켓 취소(원가 환급)를 사용하세요';
  end if;

  if upper(btrim(coalesce(v_game.game_status::text, ''))) <> 'FINISHED' then
    raise exception '종료되지 않은 경기는 정산할 수 없습니다 (현재 상태: %)', v_game.game_status;
  end if;

  select id into v_active_season_id
  from public.seasons
  where status = 'ACTIVE'
  limit 1;

  if v_active_season_id is null then
    raise exception '활성 시즌이 없습니다';
  end if;

  if v_market.season_id <> v_active_season_id then
    raise exception '시즌이 활성 상태가 아니어서 정산할 수 없습니다 (마켓 시즌: %, 현재 활성 시즌: %)',
      v_market.season_id, v_active_season_id;
  end if;

  -- 되돌리기용 포지션 스냅샷 (정산 전 보유 수량)
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'outcome', p.outcome,
      'quantity', p.quantity
    )),
    '[]'::jsonb
  )
  into v_position_snapshot
  from public.positions p
  where p.market_id = p_market_id
    and p.quantity > 0;

  update public.markets
  set
    status = 'SETTLED',
    result = v_result,
    updated_at = now()
  where id = p_market_id;

  for v_user_payout in
    select
      p.user_id,
      coalesce(sum(
        case when p.outcome = v_result then p.quantity * 100 else 0 end
      ), 0) as payout
    from public.positions p
    where p.market_id = p_market_id
      and p.quantity > 0
    group by p.user_id
  loop
    select * into v_wallet
    from public.wallets
    where user_id = v_user_payout.user_id
      and season_id = v_market.season_id
    for update;

    if not found then
      raise exception '정산 대상 사용자의 지갑을 찾을 수 없습니다 (user_id: %, season_id: %)',
        v_user_payout.user_id, v_market.season_id;
    end if;

    v_new_balance := v_wallet.balance + v_user_payout.payout;

    update public.wallets
    set balance = v_new_balance, updated_at = now()
    where id = v_wallet.id;

    insert into public.transactions (
      user_id, type, amount, balance_after, reference_id, description, season_id
    )
    values (
      v_user_payout.user_id,
      'SETTLEMENT',
      v_user_payout.payout,
      v_new_balance,
      p_market_id,
      '마켓 정산 - ' || v_result,
      v_market.season_id
    )
    returning id into v_transaction_id;

    if v_user_payout.payout > 0 then
      v_payout_snapshot := v_payout_snapshot || jsonb_build_object(
        'transaction_id', v_transaction_id,
        'user_id', v_user_payout.user_id,
        'amount', v_user_payout.payout
      );
    end if;

    v_total_users_settled := v_total_users_settled + 1;
    v_total_coins_distributed := v_total_coins_distributed + v_user_payout.payout;
  end loop;

  insert into public.settlement_events (
    market_id, original_result, position_snapshot, payout_snapshot
  )
  values (p_market_id, v_result, v_position_snapshot, v_payout_snapshot)
  on conflict (market_id) do update
  set
    original_result = excluded.original_result,
    position_snapshot = excluded.position_snapshot,
    payout_snapshot = excluded.payout_snapshot,
    created_at = now();

  update public.positions
  set quantity = 0, avg_entry_price = 0, updated_at = now()
  where market_id = p_market_id;

  return jsonb_build_object(
    'success', true,
    'total_users_settled', v_total_users_settled,
    'total_coins_distributed', v_total_coins_distributed
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', SQLERRM);
end;
$$;

grant execute on function public.settle_market(integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) admin_recover_settlement: 잘못된 정산을 되돌리고 올바른 결과로 재정산
--    기존 버전 대비 변경점
--      * 마켓의 result 를 정정된 결과로 갱신 (기존에는 틀린 결과가 그대로 남았음)
--      * 정정 후 스냅샷을 재작성해 재복구가 가능하도록 정리
--      * admin_operators 에 없는 운영자 UUID 로도 실패하지 않도록 방어
-- ---------------------------------------------------------------------------
create or replace function public.admin_recover_settlement(
  p_operator_id uuid,
  p_market_id integer,
  p_correct_result text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.settlement_events;
  v_recovery public.settlement_recoveries;
  v_market public.markets%rowtype;
  v_operator_id uuid;
  v_correct_result text;
  v_row record;
  v_wallet public.wallets%rowtype;
  v_payout numeric;
  v_new_payout_snapshot jsonb := '[]'::jsonb;
  v_transaction_id integer;
  v_reversed_total numeric := 0;
  v_repaid_total numeric := 0;
  v_recipients integer := 0;
begin
  v_correct_result := upper(btrim(coalesce(p_correct_result, '')));

  if v_correct_result not in ('HOME', 'AWAY', 'DRAW') then
    raise exception '정정 결과는 HOME, AWAY, DRAW 중 하나여야 합니다';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception '복구 사유를 입력해주세요';
  end if;

  select id into v_operator_id
  from public.admin_operators
  where id = p_operator_id;

  select * into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception '마켓을 찾을 수 없습니다';
  end if;

  select * into v_event
  from public.settlement_events
  where market_id = p_market_id
  for update;

  if not found then
    raise exception '정산 이벤트를 찾을 수 없습니다';
  end if;

  if v_event.original_result = v_correct_result then
    raise exception '정정 결과가 기존 정산 결과와 같습니다';
  end if;

  -- 1) 기존 지급분 회수
  for v_row in
    select *
    from jsonb_to_recordset(v_event.payout_snapshot)
      as q(transaction_id integer, user_id uuid, amount numeric)
  loop
    select * into v_wallet
    from public.wallets
    where user_id = v_row.user_id
      and season_id = v_market.season_id
    for update;

    if not found then
      raise exception '회수 대상 사용자의 지갑을 찾을 수 없습니다 (user_id: %)', v_row.user_id;
    end if;

    if v_wallet.balance < v_row.amount then
      raise exception '보상 차감 잔액이 부족한 사용자가 있습니다 (user_id: %, 잔액: %, 회수액: %)',
        v_row.user_id, v_wallet.balance, v_row.amount;
    end if;

    update public.wallets
    set balance = v_wallet.balance - v_row.amount, updated_at = now()
    where id = v_wallet.id;

    insert into public.transactions (
      user_id, season_id, type, amount, balance_after,
      reference_id, reverses_transaction_id, reason, description
    )
    values (
      v_row.user_id, v_market.season_id, 'SETTLEMENT_REVERSAL',
      -v_row.amount, v_wallet.balance - v_row.amount,
      p_market_id, v_row.transaction_id, p_reason, '정산 취소 보상'
    );

    v_reversed_total := v_reversed_total + v_row.amount;
  end loop;

  -- 2) 올바른 결과로 재지급
  for v_row in
    select q.user_id, sum(q.quantity) as quantity
    from jsonb_to_recordset(v_event.position_snapshot)
      as q(user_id uuid, outcome text, quantity numeric)
    where q.outcome = v_correct_result
      and q.quantity > 0
    group by q.user_id
  loop
    v_payout := v_row.quantity * 100;

    select * into v_wallet
    from public.wallets
    where user_id = v_row.user_id
      and season_id = v_market.season_id
    for update;

    if not found then
      raise exception '재지급 대상 사용자의 지갑을 찾을 수 없습니다 (user_id: %)', v_row.user_id;
    end if;

    update public.wallets
    set balance = v_wallet.balance + v_payout, updated_at = now()
    where id = v_wallet.id;

    insert into public.transactions (
      user_id, season_id, type, amount, balance_after,
      reference_id, reason, description
    )
    values (
      v_row.user_id, v_market.season_id, 'SETTLEMENT_CORRECTION',
      v_payout, v_wallet.balance + v_payout,
      p_market_id, p_reason, '정산 재처리 - ' || v_correct_result
    )
    returning id into v_transaction_id;

    v_new_payout_snapshot := v_new_payout_snapshot || jsonb_build_object(
      'transaction_id', v_transaction_id,
      'user_id', v_row.user_id,
      'amount', v_payout
    );

    v_repaid_total := v_repaid_total + v_payout;
    v_recipients := v_recipients + 1;
  end loop;

  -- 3) 마켓 결과 정정
  update public.markets
  set result = v_correct_result, status = 'SETTLED', updated_at = now()
  where id = p_market_id;

  -- 4) 복구 이력 기록 (같은 마켓을 다시 정정할 수 있도록 갱신형으로 저장)
  insert into public.settlement_recoveries (
    event_id, correct_result, reason, operator_id, status
  )
  values (v_event.id, v_correct_result, p_reason, v_operator_id, 'SUCCESS')
  on conflict (event_id) do update
  set
    correct_result = excluded.correct_result,
    reason = excluded.reason,
    operator_id = excluded.operator_id,
    status = excluded.status,
    created_at = now()
  returning * into v_recovery;

  -- 5) 다음 정정에 대비해 스냅샷을 현재 상태로 갱신
  update public.settlement_events
  set
    original_result = v_correct_result,
    payout_snapshot = v_new_payout_snapshot,
    created_at = now()
  where id = v_event.id;

  insert into public.admin_audit_logs (
    operator_id, action, target_type, target_id, before_state, after_state, success
  )
  values (
    v_operator_id, 'SETTLEMENT_RECOVERY', 'market', p_market_id::text,
    jsonb_build_object(
      'original_result', v_event.original_result,
      'payout_snapshot', v_event.payout_snapshot
    ),
    jsonb_build_object(
      'correct_result', v_correct_result,
      'reversed_total', v_reversed_total,
      'repaid_total', v_repaid_total,
      'recipient_count', v_recipients
    ),
    true
  );

  return jsonb_build_object(
    'recovery_id', v_recovery.id,
    'market_id', p_market_id,
    'previous_result', v_event.original_result,
    'correct_result', v_correct_result,
    'reversed_total', v_reversed_total,
    'repaid_total', v_repaid_total,
    'recipient_count', v_recipients
  );
end;
$$;

grant execute on function public.admin_recover_settlement(uuid, integer, text, text)
  to anon, authenticated, service_role;

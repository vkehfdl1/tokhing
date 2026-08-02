alter table public.transactions add column if not exists reason text, add column if not exists internal_memo text,
 add column if not exists admin_operator_id uuid references public.admin_operators(id),
 add column if not exists reverses_transaction_id integer unique references public.transactions(id);
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check(type in('BUY','SELL','SETTLEMENT','WEEKLY_GRANT','ADMIN_GRANT','ADMIN_DEDUCTION','ADMIN_REVERSAL','SEASON_GRANT'));

create or replace function public.admin_adjust_wallet(p_operator_id uuid,p_user_id uuid,p_season_id integer,p_amount numeric,p_reason text,p_internal_memo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.wallets; n numeric; t public.transactions;
begin
 if p_amount=0 then raise exception '금액은 0이 아니어야 합니다'; end if;
 if btrim(coalesce(p_reason,''))='' or btrim(coalesce(p_internal_memo,''))='' then raise exception '사유와 내부 메모를 입력해주세요'; end if;
 select * into w from public.wallets where user_id=p_user_id and season_id=p_season_id for update;
 if not found then raise exception '지갑을 찾을 수 없습니다'; end if;
 n:=w.balance+p_amount; if n<0 then raise exception '차감 후 잔액은 음수가 될 수 없습니다'; end if;
 update public.wallets set balance=n,updated_at=now() where id=w.id;
 insert into public.transactions(user_id,season_id,type,amount,balance_after,reason,internal_memo,admin_operator_id,description)
 values(p_user_id,p_season_id,case when p_amount>0 then 'ADMIN_GRANT' else 'ADMIN_DEDUCTION' end,p_amount,n,p_reason,p_internal_memo,p_operator_id,'관리자 지갑 조정') returning * into t;
 insert into public.admin_audit_logs(operator_id,action,target_type,target_id,before_state,after_state,success)
 values(p_operator_id,'WALLET_ADJUST','wallet',w.id::text,jsonb_build_object('balance',w.balance,'reason',p_reason),jsonb_build_object('balance',n,'transaction_id',t.id),true);
 return jsonb_build_object('transaction_id',t.id,'before_balance',w.balance,'after_balance',n);
end; $$;
create or replace function public.admin_cancel_admin_grant(p_operator_id uuid,p_transaction_id integer,p_reason text,p_internal_memo text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.transactions; w public.wallets; t public.transactions; n numeric;
begin
 select * into o from public.transactions where id=p_transaction_id and type='ADMIN_GRANT' for update;
 if not found then raise exception '취소할 관리자 지급을 찾을 수 없습니다'; end if;
 if exists(select 1 from public.transactions where reverses_transaction_id=o.id) then raise exception '이미 취소된 관리자 지급입니다'; end if;
 select * into w from public.wallets where user_id=o.user_id and season_id=o.season_id for update;
 n:=w.balance-o.amount; if n<0 then raise exception '취소 후 잔액은 음수가 될 수 없습니다'; end if;
 update public.wallets set balance=n,updated_at=now() where id=w.id;
 insert into public.transactions(user_id,season_id,type,amount,balance_after,reason,internal_memo,admin_operator_id,reverses_transaction_id,description)
 values(o.user_id,o.season_id,'ADMIN_REVERSAL',-o.amount,n,p_reason,p_internal_memo,p_operator_id,o.id,'관리자 지급 취소') returning * into t;
 insert into public.admin_audit_logs(operator_id,action,target_type,target_id,before_state,after_state,success)
 values(p_operator_id,'WALLET_GRANT_CANCEL','transaction',o.id::text,to_jsonb(o),to_jsonb(t),true);
 return jsonb_build_object('transaction_id',t.id,'reverses_transaction_id',o.id,'after_balance',n);
end; $$;
create or replace function public.get_wallet_diagnostics(p_user_id uuid,p_season_id integer)
returns jsonb language sql security definer set search_path=public as $$
select jsonb_build_object('wallet',to_jsonb(w),'ledger_sum',coalesce((select sum(amount) from transactions where user_id=p_user_id and season_id=p_season_id),0),
'mismatch',w.balance<>coalesce((select sum(amount) from transactions where user_id=p_user_id and season_id=p_season_id),0),
'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from transactions where user_id=p_user_id and season_id=p_season_id order by created_at desc limit 100)t),'[]')) from wallets w where user_id=p_user_id and season_id=p_season_id; $$;
create or replace function public.admin_wallet_recovery_json(p_input jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_input->>'action'='adjust' then
  return public.admin_adjust_wallet(
   nullif(p_input->>'operator_id','undefined')::uuid,
   nullif(p_input->>'user_id','undefined')::uuid,
   (p_input->>'season_id')::integer,(p_input->>'amount')::numeric,
   p_input->>'reason',p_input->>'memo');
 end if;
 return public.admin_cancel_admin_grant(
  nullif(p_input->>'operator_id','undefined')::uuid,
  (p_input->>'transaction_id')::integer,p_input->>'reason',p_input->>'memo');
end; $$;
revoke all on function public.admin_adjust_wallet(uuid,uuid,integer,numeric,text,text),public.admin_cancel_admin_grant(uuid,integer,text,text),public.get_wallet_diagnostics(uuid,integer) from public,anon,authenticated;
grant execute on function public.admin_adjust_wallet(uuid,uuid,integer,numeric,text,text),public.admin_cancel_admin_grant(uuid,integer,text,text),public.get_wallet_diagnostics(uuid,integer) to service_role;
revoke all on function public.admin_wallet_recovery_json(jsonb) from public,anon,authenticated;
grant execute on function public.admin_wallet_recovery_json(jsonb) to service_role;

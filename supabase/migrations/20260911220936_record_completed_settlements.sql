-- Manual records are completed immediately. Legacy pending records remain resolvable.
alter table public.settlements add column payment_date date;
alter table public.settlements alter column payment_method drop not null;

create function app_private.record_settlement(p_group_id uuid,p_paid_by uuid,p_paid_to uuid,p_amount numeric,p_payment_method text,p_note text,p_idempotency_key uuid,p_payment_date date)
returns public.settlements language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.settlements; existing public.settlements;
begin
  actor := app_private.require_ledger_member(p_group_id);
  perform 1 from public.groups where id=p_group_id for update;
  actor := app_private.require_ledger_member(p_group_id);
  if p_payment_date is null or p_payment_date < date '1900-01-01' or p_payment_date > (now() at time zone 'UTC')::date + 1 then
    raise exception 'Choose a valid payment date';
  end if;
  select * into existing from public.settlements where created_by=actor and idempotency_key=p_idempotency_key;
  if found and existing.payment_date is distinct from p_payment_date then
    raise exception 'Idempotency key already used for another payment date';
  end if;
  result := app_private.create_settlement(p_group_id,p_paid_by,p_paid_to,p_amount,'confirmed',p_payment_method,p_note,p_idempotency_key);
  if existing.id is null then
    update public.settlements set payment_date=p_payment_date where id=result.id returning * into result;
  end if;
  return result;
end $$;
revoke all on function app_private.record_settlement(uuid,uuid,uuid,numeric,text,text,uuid,date) from public,anon;
grant execute on function app_private.record_settlement(uuid,uuid,uuid,numeric,text,text,uuid,date) to authenticated;

create function public.record_settlement(p_group_id uuid,p_paid_by uuid,p_paid_to uuid,p_amount numeric,p_payment_method text,p_note text,p_idempotency_key uuid,p_payment_date date)
returns public.settlements language sql security invoker set search_path = '' as $$
  select app_private.record_settlement(p_group_id,p_paid_by,p_paid_to,p_amount,p_payment_method,p_note,p_idempotency_key,p_payment_date)
$$;
revoke all on function public.record_settlement(uuid,uuid,uuid,numeric,text,text,uuid,date) from public,anon;
grant execute on function public.record_settlement(uuid,uuid,uuid,numeric,text,text,uuid,date) to authenticated;

-- Profile-based, auditable settlements. Public RPCs delegate to private,
-- explicitly authorized implementations so clients cannot forge ledger writes.
alter table public.groups add column currency text not null default 'USD'
  check (currency = 'USD'); -- first release supports cents / USD only
alter table public.expenses add column paid_by uuid references public.profiles(id);
update public.expenses set paid_by = created_by;
alter table public.expenses alter column paid_by set not null;
create index if not exists idx_expenses_paid_by on public.expenses(paid_by);

alter table public.settlements drop constraint if exists settlements_paid_by_fkey,
  drop constraint if exists settlements_paid_to_fkey;
update public.settlements s set paid_by = p.id from public.profiles p
where s.paid_by = p.auth_user_id;
update public.settlements s set paid_to = p.id from public.profiles p
where s.paid_to = p.auth_user_id;
alter table public.settlements
  add constraint settlements_paid_by_fkey foreign key (paid_by) references public.profiles(id),
  add constraint settlements_paid_to_fkey foreign key (paid_to) references public.profiles(id),
  add column status text not null default 'confirmed' check (status in ('pending','confirmed','voided')),
  add column initial_status text not null default 'confirmed' check (initial_status in ('pending','confirmed')),
  add column created_by uuid references public.profiles(id),
  add column confirmed_by uuid references public.profiles(id),
  add column voided_by uuid references public.profiles(id),
  add column created_at timestamptz not null default now(),
  add column confirmed_at timestamptz,
  add column voided_at timestamptz,
  add column void_reason text,
  add column payment_method text not null default 'other'
    check (payment_method in ('venmo','cashapp','paypal','cash','bank_transfer','other')),
  add column provider_reference text,
  add column idempotency_key uuid,
  add constraint settlements_distinct_participants check (paid_by <> paid_to),
  add constraint settlements_valid_amount check (amount > 0 and amount < 1000000000 and amount = round(amount,2));
-- Legacy records have no reliable actor attribution: leave actor fields null.
update public.settlements set confirmed_at = coalesce(settled_at,created_at);
create unique index if not exists settlements_idempotency on public.settlements(created_by,idempotency_key);
create index if not exists idx_settlements_paid_by on public.settlements(paid_by);
create index if not exists idx_settlements_paid_to on public.settlements(paid_to);
create index if not exists idx_settlements_created_by on public.settlements(created_by);
create index if not exists idx_settlements_confirmed_by on public.settlements(confirmed_by);
create index if not exists idx_settlements_voided_by on public.settlements(voided_by);
alter table public.settlement_items add column expense_split_id uuid references public.expense_splits(id);
create index if not exists idx_settlement_items_expense_split_id on public.settlement_items(expense_split_id);

revoke insert,update,delete on public.settlements,public.settlement_items,public.settlement_shares from anon,authenticated;
-- Share links are future work; avoid retaining auth-ID write policies against
-- the now profile-ID settlement participants.
do $$ declare r record;
begin
  for r in select tablename,policyname from pg_policies where schemaname='public'
    and tablename in ('settlements','settlement_items','settlement_shares') and cmd<>'SELECT' loop
    execute format('drop policy %I on public.%I',r.policyname,r.tablename);
  end loop;
end $$;
revoke insert,update on public.expenses from anon,authenticated;
revoke insert,update,delete on public.expense_splits from anon,authenticated;
do $$ declare r record;
begin
  for r in select table_name,column_name,privilege_type,grantee from information_schema.column_privileges
    where table_schema='public' and grantee in ('anon','authenticated')
      and ((table_name in ('settlements','settlement_items','settlement_shares','expense_splits') and privilege_type in ('INSERT','UPDATE','REFERENCES'))
        or (table_name='expenses' and privilege_type in ('INSERT','UPDATE'))) loop
    execute format('revoke %s (%I) on public.%I from %I',r.privilege_type,r.column_name,r.table_name,r.grantee);
  end loop;
end $$;

create function app_private.ledger_balances(p_group_id uuid)
returns table(profile_id uuid,balance numeric)
language sql stable set search_path = '' as $$
  with events as (
    select m.user_id profile_id,0::numeric delta from public.memberships m where m.group_id=p_group_id
    union all select e.paid_by,e.amount from public.expenses e where e.group_id=p_group_id
    union all select s.user_id,-s.amount from public.expense_splits s join public.expenses e on e.id=s.expense_id where e.group_id=p_group_id
    union all select s.paid_by,s.amount from public.settlements s where s.group_id=p_group_id and s.status='confirmed'
    union all select s.paid_to,-s.amount from public.settlements s where s.group_id=p_group_id and s.status='confirmed'
  ) select events.profile_id,sum(delta) from events group by events.profile_id
$$;
revoke all on function app_private.ledger_balances(uuid) from public,anon,authenticated;

create function app_private.require_ledger_member(p_group_id uuid)
returns uuid language plpgsql set search_path = '' as $$
declare actor uuid;
begin
  actor := app_private.get_current_profile_id();
  if auth.uid() is null or actor is null or not exists (
    select 1 from public.memberships where group_id=p_group_id and user_id=actor
  ) then raise exception 'Group membership required' using errcode='42501'; end if;
  return actor;
end $$;
revoke all on function app_private.require_ledger_member(uuid) from public,anon,authenticated;

create function app_private.assert_group_ledger_valid(p_group_id uuid)
returns void language plpgsql stable set search_path = '' as $$
begin
  if exists(select 1 from public.expenses e where e.group_id=p_group_id and (
    e.amount<=0 or e.amount>=1000000000 or e.amount<>round(e.amount,2)
    or not exists(select 1 from public.expense_splits s where s.expense_id=e.id)
    or e.amount<>(select sum(s.amount) from public.expense_splits s where s.expense_id=e.id)
    or exists(select 1 from public.expense_splits s where s.expense_id=e.id and (s.amount<0 or s.amount>=1000000000 or s.amount<>round(s.amount,2)))
  )) then raise exception 'Correct expense splits before settling: one or more expense totals do not match their splits'; end if;
end $$;
revoke all on function app_private.assert_group_ledger_valid(uuid) from public,anon,authenticated;

create function app_private.get_group_balances(p_group_id uuid)
returns table(profile_id uuid,balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_ledger_member(p_group_id);
  perform app_private.assert_group_ledger_valid(p_group_id);
  return query select * from app_private.ledger_balances(p_group_id);
end $$;
create function public.get_group_balances(p_group_id uuid)
returns table(profile_id uuid,balance numeric)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.get_group_balances(p_group_id)
$$;

create function app_private.validate_settlement_amount(p_group_id uuid,p_paid_by uuid,p_paid_to uuid,p_amount numeric)
returns void language plpgsql set search_path = '' as $$
declare debtor numeric; creditor numeric;
begin
  perform app_private.assert_group_ledger_valid(p_group_id);
  if p_paid_by is null or p_paid_to is null or p_paid_by=p_paid_to then raise exception 'Choose two different group members'; end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000 or p_amount <> round(p_amount,2) then raise exception 'Amount must be positive whole cents'; end if;
  if (select count(*) from public.memberships where group_id=p_group_id and user_id in (p_paid_by,p_paid_to)) <> 2 then raise exception 'Both participants must be group members'; end if;
  select -balance into debtor from app_private.ledger_balances(p_group_id) where profile_id=p_paid_by;
  select balance into creditor from app_private.ledger_balances(p_group_id) where profile_id=p_paid_to;
  if p_amount > least(coalesce(debtor,0),coalesce(creditor,0)) then raise exception 'Payment exceeds the outstanding balance; refresh balances'; end if;
end $$;
revoke all on function app_private.validate_settlement_amount(uuid,uuid,uuid,numeric) from public,anon,authenticated;

create function app_private.create_settlement(p_group_id uuid,p_paid_by uuid,p_paid_to uuid,p_amount numeric,p_status text,p_payment_method text,p_note text,p_idempotency_key uuid)
returns public.settlements language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.settlements;
begin
  actor := app_private.require_ledger_member(p_group_id);
  perform 1 from public.groups where id=p_group_id for update;
  actor := app_private.require_ledger_member(p_group_id);
  if p_idempotency_key is null then raise exception 'An idempotency key is required'; end if;
  if p_status is null or p_status not in ('pending','confirmed') then raise exception 'Invalid initial settlement status'; end if;
  select * into result from public.settlements where created_by=actor and idempotency_key=p_idempotency_key;
  if found then
    if result.group_id is distinct from p_group_id or result.paid_by is distinct from p_paid_by or result.paid_to is distinct from p_paid_to or result.amount is distinct from p_amount or result.initial_status is distinct from p_status or result.payment_method is distinct from p_payment_method or result.note is distinct from nullif(btrim(p_note),'') then
      raise exception 'Idempotency key already used for another payment';
    end if;
    return result;
  end if;
  if p_status is null or p_status not in ('pending','confirmed') then raise exception 'Invalid initial settlement status'; end if;
  if not app_private.is_group_admin(p_group_id) and not (actor=p_paid_by or (p_status='confirmed' and actor=p_paid_to)) then raise exception 'Only a payment participant or admin can record this payment' using errcode='42501'; end if;
  perform app_private.validate_settlement_amount(p_group_id,p_paid_by,p_paid_to,p_amount);
  insert into public.settlements(group_id,paid_by,paid_to,amount,status,initial_status,payment_method,note,idempotency_key,created_by,confirmed_by,confirmed_at,settled_at)
  values(p_group_id,p_paid_by,p_paid_to,p_amount,p_status,p_status,p_payment_method,nullif(btrim(p_note),''),p_idempotency_key,actor,
    case when p_status='confirmed' then actor end,case when p_status='confirmed' then now() end,case when p_status='confirmed' then now() end)
  returning * into result;
  return result;
end $$;
create function public.create_settlement(p_group_id uuid,p_paid_by uuid,p_paid_to uuid,p_amount numeric,p_status text,p_payment_method text,p_note text,p_idempotency_key uuid)
returns public.settlements language sql security invoker set search_path = '' as $$
  select app_private.create_settlement(p_group_id,p_paid_by,p_paid_to,p_amount,p_status,p_payment_method,p_note,p_idempotency_key)
$$;

create function app_private.confirm_settlement(p_settlement_id uuid)
returns public.settlements language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.settlements;
begin
  select * into result from public.settlements where id=p_settlement_id;
  actor:=app_private.require_ledger_member(result.group_id);
  perform 1 from public.groups where id=result.group_id for update;
  actor:=app_private.require_ledger_member(result.group_id);
  select * into result from public.settlements where id=p_settlement_id for update;
  if actor<>result.paid_to and not app_private.is_group_admin(result.group_id) then raise exception 'Only recipient or admin can confirm receipt' using errcode='42501'; end if;
  if result.status='confirmed' then return result; end if;
  if result.status<>'pending' then raise exception 'Only pending payments can be confirmed'; end if;
  perform app_private.validate_settlement_amount(result.group_id,result.paid_by,result.paid_to,result.amount);
  update public.settlements set status='confirmed',confirmed_by=actor,confirmed_at=now(),settled_at=now() where id=p_settlement_id returning * into result;
  return result;
end $$;
create function public.confirm_settlement(p_settlement_id uuid)
returns public.settlements language sql security invoker set search_path = '' as $$ select app_private.confirm_settlement(p_settlement_id) $$;

create function app_private.void_settlement(p_settlement_id uuid,p_note text default null)
returns public.settlements language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.settlements;
begin
  select * into result from public.settlements where id=p_settlement_id;
  actor:=app_private.require_ledger_member(result.group_id);
  perform 1 from public.groups where id=result.group_id for update;
  actor:=app_private.require_ledger_member(result.group_id);
  select * into result from public.settlements where id=p_settlement_id for update;
  if actor not in (result.paid_by,result.paid_to) and not app_private.is_group_admin(result.group_id) then raise exception 'Only payment participants or admin can void' using errcode='42501'; end if;
  if result.status='voided' then return result; end if;
  update public.settlements set status='voided',voided_by=actor,voided_at=now(),void_reason=nullif(btrim(p_note),'') where id=p_settlement_id returning * into result;
  return result;
end $$;
create function public.void_settlement(p_settlement_id uuid,p_note text default null)
returns public.settlements language sql security invoker set search_path = '' as $$ select app_private.void_settlement(p_settlement_id,p_note) $$;

create function app_private.validate_expense_splits(p_group_id uuid,p_amount numeric,p_splits jsonb)
returns void language plpgsql set search_path = '' as $$
begin
  if p_amount is null or p_amount<=0 or p_amount>=1000000000 or p_amount<>round(p_amount,2) then raise exception 'Expense amount must be positive whole cents'; end if;
  if p_splits is null or jsonb_typeof(p_splits)<>'array' or jsonb_array_length(p_splits)=0 then raise exception 'At least one split is required'; end if;
  if exists (select 1 from jsonb_to_recordset(p_splits) as s(user_id uuid,amount numeric,share numeric)
    where s.user_id is null or s.amount is null or s.amount<0 or s.amount>=1000000000 or s.amount<>round(s.amount,2)
      or (s.share is not null and (s.share<0 or s.share>1))
      or not exists(select 1 from public.memberships m where m.group_id=p_group_id and m.user_id=s.user_id)) then raise exception 'Invalid split or participant'; end if;
  if (select sum(s.amount) from jsonb_to_recordset(p_splits) as s(amount numeric))<>p_amount then raise exception 'Split amounts must equal expense total'; end if;
  if (select count(distinct s.user_id) from jsonb_to_recordset(p_splits) as s(user_id uuid))<>jsonb_array_length(p_splits) then raise exception 'Duplicate split participant'; end if;
end $$;
revoke all on function app_private.validate_expense_splits(uuid,numeric,jsonb) from public,anon,authenticated;

create function app_private.create_expense_with_splits(p_group_id uuid,p_description text,p_amount numeric,p_date date,p_paid_by uuid,p_splits jsonb)
returns public.expenses language plpgsql security definer set search_path = '' as $$
declare actor uuid; result public.expenses;
begin
  actor:=app_private.require_ledger_member(p_group_id);
  perform 1 from public.groups where id=p_group_id for update;
  actor:=app_private.require_ledger_member(p_group_id);
  if p_paid_by is null or not exists(select 1 from public.memberships where group_id=p_group_id and user_id=p_paid_by) then raise exception 'Payer must be a group member'; end if;
  if p_paid_by<>actor and not app_private.is_group_admin(p_group_id) then raise exception 'Only admin can record for another payer' using errcode='42501'; end if;
  perform app_private.validate_expense_splits(p_group_id,p_amount,p_splits);
  insert into public.expenses(group_id,created_by,paid_by,description,amount,date) values(p_group_id,actor,p_paid_by,nullif(btrim(p_description),''),p_amount,p_date) returning * into result;
  insert into public.expense_splits(expense_id,user_id,share,amount) select result.id,s.user_id,s.share,s.amount from jsonb_to_recordset(p_splits) as s(user_id uuid,share numeric,amount numeric);
  return result;
end $$;
create function public.create_expense_with_splits(p_group_id uuid,p_description text,p_amount numeric,p_date date,p_paid_by uuid,p_splits jsonb)
returns public.expenses language sql security invoker set search_path = '' as $$ select app_private.create_expense_with_splits(p_group_id,p_description,p_amount,p_date,p_paid_by,p_splits) $$;

-- Keep the trusted Edge Function's existing update API, with shared validation.
drop function public.update_expense_with_splits(uuid,text,numeric,date,jsonb);
create function public.update_expense_with_splits(p_expense_id uuid,p_description text,p_amount numeric,p_date date,p_splits jsonb,p_paid_by uuid default null)
returns public.expenses language plpgsql security invoker set search_path = '' as $$
declare result public.expenses;
begin
  select * into result from public.expenses where id=p_expense_id;
  if not found then raise exception 'Expense not found'; end if;
  perform 1 from public.groups where id=result.group_id for update;
  perform app_private.validate_expense_splits(result.group_id,p_amount,p_splits);
  if p_paid_by is not null and not exists(select 1 from public.memberships where group_id=result.group_id and user_id=p_paid_by) then raise exception 'Payer must be a group member'; end if;
  update public.expenses set description=nullif(btrim(p_description),''),amount=p_amount,date=p_date,paid_by=coalesce(p_paid_by,paid_by) where id=p_expense_id returning * into result;
  delete from public.expense_splits where expense_id=p_expense_id;
  insert into public.expense_splits(expense_id,user_id,share,amount) select p_expense_id,s.user_id,s.share,s.amount from jsonb_to_recordset(p_splits) as s(user_id uuid,share numeric,amount numeric);
  return result;
end $$;
revoke all on function public.update_expense_with_splits(uuid,text,numeric,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.update_expense_with_splits(uuid,text,numeric,date,jsonb,uuid) to service_role;
grant usage on schema app_private to service_role;
grant execute on function app_private.validate_expense_splits(uuid,numeric,jsonb) to service_role;

-- Removing an unsettled participant must not erase responsibility. Group deletion
-- still cascades normally because its parent row no longer exists at this point.
create function app_private.guard_ledger_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  gid:=old.group_id;
  perform 1 from public.groups where id=gid for update;
  if not found then return old; end if;
  if tg_table_name='memberships' then
    if tg_op='UPDATE' and new.user_id=old.user_id and new.group_id=old.group_id then return new; end if;
    perform app_private.assert_group_ledger_valid(gid);
    if exists(select 1 from app_private.ledger_balances(gid) where profile_id=old.user_id and balance<>0)
       or exists(select 1 from public.settlements where group_id=gid and status='pending' and old.user_id in (paid_by,paid_to)) then
      raise exception 'Settle this member balance and resolve pending payments before removing them';
    end if;
  elsif exists(select 1 from public.settlements where group_id=gid and status='confirmed') then
    raise exception 'This group has confirmed payments; edit the expense or void payments before deleting it';
  end if;
  if tg_op='UPDATE' then return new; end if;
  return old;
end $$;
revoke all on function app_private.guard_ledger_history() from public,anon,authenticated;
create trigger guard_membership_ledger before delete or update on public.memberships for each row execute function app_private.guard_ledger_history();
create trigger guard_expense_ledger before delete on public.expenses for each row execute function app_private.guard_ledger_history();

-- Serialize even service-role ledger edits with settlement confirmation.
create function app_private.lock_expense_group()
returns trigger language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  if tg_table_name='expenses' then
    if tg_op='UPDATE' and (new.group_id<>old.group_id or new.created_by<>old.created_by) then raise exception 'Expense group and creator cannot change'; end if;
    gid:=case when tg_op='DELETE' then old.group_id else new.group_id end;
  else
    select e.group_id into gid from public.expenses e where e.id=case when tg_op='DELETE' then old.expense_id else new.expense_id end;
    if tg_op='UPDATE' and new.expense_id<>old.expense_id then raise exception 'Split expense cannot change'; end if;
  end if;
  perform 1 from public.groups where id=gid for update;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.lock_expense_group() from public,anon,authenticated;
create trigger lock_expense_group before insert or update or delete on public.expenses for each row execute function app_private.lock_expense_group();
create trigger lock_split_group before insert or update or delete on public.expense_splits for each row execute function app_private.lock_expense_group();

create function app_private.validate_changed_expense()
returns trigger language plpgsql security definer set search_path = '' as $$
declare eid uuid; expense public.expenses;
begin
  if tg_table_name='expenses' then eid:=new.id;
  else eid:=case when tg_op='DELETE' then old.expense_id else new.expense_id end; end if;
  select * into expense from public.expenses where id=eid;
  if not found then return null; end if;
  perform app_private.validate_expense_splits(expense.group_id,expense.amount,
    (select jsonb_agg(jsonb_build_object('user_id',s.user_id,'amount',s.amount,'share',s.share)) from public.expense_splits s where s.expense_id=eid));
  return null;
end $$;
revoke all on function app_private.validate_changed_expense() from public,anon,authenticated;
create constraint trigger validate_expense_total after insert or update on public.expenses deferrable initially deferred for each row execute function app_private.validate_changed_expense();
create constraint trigger validate_split_total after insert or update or delete on public.expense_splits deferrable initially deferred for each row execute function app_private.validate_changed_expense();

-- Restrict every new endpoint (including the private implementation).
do $$ declare ns text; signature text;
begin
  foreach ns in array array['public','app_private'] loop
    foreach signature in array array[
      'get_group_balances(uuid)',
      'create_settlement(uuid,uuid,uuid,numeric,text,text,text,uuid)',
      'confirm_settlement(uuid)',
      'void_settlement(uuid,text)',
      'create_expense_with_splits(uuid,text,numeric,date,uuid,jsonb)'
    ] loop
      execute 'revoke all on function '||ns||'.'||signature||' from public,anon,authenticated';
      execute 'grant execute on function '||ns||'.'||signature||' to authenticated';
    end loop;
  end loop;
end $$;

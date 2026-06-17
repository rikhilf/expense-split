-- Normalize group creator ownership to profiles.id and add the edit-expense
-- transactional helper. Expense creator normalization/RLS hardening lives in the
-- earlier PR #18 migrations.

insert into public.profiles (auth_user_id, display_name, email)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1), 'User'),
  u.email
from auth.users u
where exists (
  select 1
  from public.groups g
  where g.created_by = u.id
)
and not exists (
  select 1
  from public.profiles p
  where p.auth_user_id = u.id
);

update public.groups g
set created_by = p.id
from public.profiles p
where g.created_by = p.auth_user_id;

do $$
begin
  if exists (
    select 1
    from public.groups g
    left join public.profiles p on p.id = g.created_by
    where p.id is null
  ) then
    raise exception 'Cannot normalize groups.created_by: some values do not match profiles.id or profiles.auth_user_id';
  end if;
end $$;

alter table public.groups
  drop constraint if exists groups_created_by_fkey,
  add constraint groups_created_by_fkey
    foreign key (created_by) references public.profiles(id);

comment on column public.groups.created_by is 'profiles.id for the profile that created the group';

drop policy if exists "Select groups I created or belong to" on public.groups;
create policy "Select groups I created or belong to"
on public.groups
for select
to public
using (
  created_by = app_private.get_current_profile_id()
  or exists (
    select 1
    from public.memberships m
    where m.group_id = groups.id
      and m.user_id = app_private.get_current_profile_id()
  )
);

drop policy if exists "Any user can create group" on public.groups;
create policy "Any user can create group"
on public.groups
for insert
to public
with check (
  created_by = app_private.get_current_profile_id()
);

revoke update (created_by) on public.groups from anon, authenticated;

create or replace function public.update_expense_with_splits(
  p_expense_id uuid,
  p_description text,
  p_amount numeric,
  p_date date,
  p_splits jsonb
)
returns public.expenses
language plpgsql
set search_path = public
as $$
declare
  updated_expense public.expenses;
begin
  if p_amount <= 0 then
    raise exception 'Expense amount must be greater than zero';
  end if;

  if jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one split is required';
  end if;

  update public.expenses
  set
    description = nullif(btrim(p_description), ''),
    amount = p_amount,
    date = p_date
  where id = p_expense_id
  returning * into updated_expense;

  if updated_expense.id is null then
    raise exception 'Expense not found';
  end if;

  delete from public.expense_splits
  where expense_id = p_expense_id;

  insert into public.expense_splits (expense_id, user_id, share, amount)
  select
    p_expense_id,
    split.user_id,
    split.share,
    split.amount
  from jsonb_to_recordset(p_splits) as split(
    user_id uuid,
    share numeric,
    amount numeric
  );

  return updated_expense;
end;
$$;

revoke all on function public.update_expense_with_splits(uuid, text, numeric, date, jsonb) from anon;
revoke all on function public.update_expense_with_splits(uuid, text, numeric, date, jsonb) from authenticated;
grant execute on function public.update_expense_with_splits(uuid, text, numeric, date, jsonb) to service_role;

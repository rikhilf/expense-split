do $$
begin
  insert into public.profiles (auth_user_id, display_name, email)
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1), 'User'),
    u.email
  from auth.users u
  where exists (
    select 1
    from public.expenses e
    where e.created_by = u.id
  )
  and not exists (
    select 1
    from public.profiles p
    where p.auth_user_id = u.id
  );

  update public.expenses e
  set created_by = p.id
  from public.profiles p
  where e.created_by = p.auth_user_id;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_created_by_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_created_by_fkey
      foreign key (created_by) references public.profiles(id);
  end if;
end $$;

drop policy if exists "Creator or admin can update expense" on public.expenses;
drop policy if exists "Creator or admin can delete expense" on public.expenses;

create policy "Creator profile or admin can update expense"
on public.expenses
for update
using (
  created_by = public.get_current_profile_id()
  or public.is_group_admin(group_id)
)
with check (
  (
    created_by = public.get_current_profile_id()
    and public.is_member_of_group(group_id)
  )
  or public.is_group_admin(group_id)
);

revoke update (created_by, group_id) on public.expenses from anon, authenticated;

create policy "Creator profile or admin can delete expense"
on public.expenses
for delete
using (
  created_by = public.get_current_profile_id()
  or public.is_group_admin(group_id)
);

drop policy if exists "Group members can add splits" on public.expense_splits;
drop policy if exists "Participant or admin can update split" on public.expense_splits;
drop policy if exists "Participant or admin can delete split" on public.expense_splits;

create policy "Expense creator or admin can add splits"
on public.expense_splits
for insert
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = public.get_current_profile_id()
        or public.is_group_admin(e.group_id)
      )
  )
);

create policy "Expense creator or admin can update splits"
on public.expense_splits
for update
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = public.get_current_profile_id()
        or public.is_group_admin(e.group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = public.get_current_profile_id()
        or public.is_group_admin(e.group_id)
      )
  )
);

create policy "Expense creator or admin can delete splits"
on public.expense_splits
for delete
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = public.get_current_profile_id()
        or public.is_group_admin(e.group_id)
      )
  )
);

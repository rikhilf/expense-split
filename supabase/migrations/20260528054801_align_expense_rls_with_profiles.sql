do $$
begin
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
  created_by = public.get_current_profile_id()
  or public.is_group_admin(group_id)
);

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

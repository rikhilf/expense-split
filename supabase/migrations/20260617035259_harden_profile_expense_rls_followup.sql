drop policy if exists "Expense creator or admin can add splits" on public.expense_splits;
create policy "Expense creator or admin can add splits"
on public.expense_splits
for insert
with check (
  exists (
    select 1
    from public.expenses e
    join public.memberships split_member
      on split_member.group_id = e.group_id
     and split_member.user_id = expense_splits.user_id
    where e.id = expense_splits.expense_id
      and (
        e.created_by = app_private.get_current_profile_id()
        or app_private.is_group_admin(e.group_id)
      )
  )
);

drop policy if exists "Expense creator or admin can update splits" on public.expense_splits;
create policy "Expense creator or admin can update splits"
on public.expense_splits
for update
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = app_private.get_current_profile_id()
        or app_private.is_group_admin(e.group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.expenses e
    join public.memberships split_member
      on split_member.group_id = e.group_id
     and split_member.user_id = expense_splits.user_id
    where e.id = expense_splits.expense_id
      and (
        e.created_by = app_private.get_current_profile_id()
        or app_private.is_group_admin(e.group_id)
      )
  )
);

drop policy if exists "Group members can add expenses" on public.expenses;
create policy "Group members can add expenses"
on public.expenses
for insert
with check (
  created_by = app_private.get_current_profile_id()
  and app_private.is_member_of_group(group_id)
);

drop policy if exists "profiles_update_placeholder_name" on public.profiles;
create policy "profiles_update_placeholder_name"
on public.profiles
for update
using (
  auth_user_id is null
  and exists (
    select 1
    from public.memberships target_membership
    join public.memberships caller_membership
      on caller_membership.group_id = target_membership.group_id
    where target_membership.user_id = profiles.id
      and caller_membership.user_id = app_private.get_current_profile_id()
      and caller_membership.role = 'admin'
  )
)
with check (
  auth_user_id is null
);

drop policy if exists "Expense creator or admin can delete splits" on public.expense_splits;
create policy "Expense creator or admin can delete splits"
on public.expense_splits
for delete
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and (
        e.created_by = app_private.get_current_profile_id()
        or app_private.is_group_admin(e.group_id)
        or (
          app_private.is_member_of_group(e.group_id)
          and exists (
            select 1
            from public.profiles p
            where p.id = expense_splits.user_id
              and p.auth_user_id is null
          )
        )
      )
  )
);

drop policy if exists "Group members can add invoices" on public.invoices;
create policy "Group members can add invoices"
on public.invoices
for insert
with check (
  uploaded_by = (select auth.uid())
  and (
    group_id is null
    or app_private.is_member_of_group(group_id)
  )
  and (
    expense_id is null
    or exists (
      select 1
      from public.expenses e
      where e.id = invoices.expense_id
        and app_private.is_member_of_group(e.group_id)
    )
  )
);

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
on public.profiles
for select
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = auth_user_id
);

drop policy if exists "Creator profile or admin can update expense" on public.expenses;
create policy "Creator profile or admin can update expense"
on public.expenses
for update
using (
  created_by = app_private.get_current_profile_id()
  or app_private.is_group_admin(group_id)
)
with check (
  (
    created_by = app_private.get_current_profile_id()
    and app_private.is_member_of_group(group_id)
  )
  or app_private.is_group_admin(group_id)
);

revoke update (created_by, group_id) on public.expenses from anon, authenticated;

drop policy if exists "Insert settlement_items if member of group" on public.settlement_items;
create policy "Insert settlement_items if member of group"
on public.settlement_items
for insert
with check (
  exists (
    select 1
    from public.settlements s
    join public.expenses e
      on e.id = settlement_items.expense_id
     and e.group_id = s.group_id
    where s.id = settlement_items.settlement_id
      and app_private.is_member_of_group(s.group_id)
  )
);

drop policy if exists "Update settlement_items if payer or admin" on public.settlement_items;
create policy "Update settlement_items if payer or admin"
on public.settlement_items
for update
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_items.settlement_id
      and (
        s.paid_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.settlements s
    join public.expenses e
      on e.id = settlement_items.expense_id
     and e.group_id = s.group_id
    where s.id = settlement_items.settlement_id
      and (
        s.paid_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
);

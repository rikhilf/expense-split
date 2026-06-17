create schema if not exists app_private;

grant usage on schema app_private to anon, authenticated;

create or replace function app_private.get_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function app_private.is_member_of_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
      and m.user_id = app_private.get_current_profile_id()
  )
$$;

create or replace function app_private.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
      and m.user_id = app_private.get_current_profile_id()
      and m.role = 'admin'
  )
$$;

create or replace function app_private.is_caller_member_of_group(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
      and m.user_id = app_private.get_current_profile_id()
  )
$$;

create or replace function app_private.group_has_members(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships m
    where m.group_id = gid
  )
$$;

grant execute on function app_private.get_current_profile_id() to anon, authenticated;
grant execute on function app_private.is_member_of_group(uuid) to anon, authenticated;
grant execute on function app_private.is_group_admin(uuid) to anon, authenticated;
grant execute on function app_private.is_caller_member_of_group(uuid) to anon, authenticated;
grant execute on function app_private.group_has_members(uuid) to anon, authenticated;

drop policy if exists "Group Members can view splits" on public.expense_splits;
drop policy if exists "Expense creator or admin can add splits" on public.expense_splits;
drop policy if exists "Expense creator or admin can update splits" on public.expense_splits;
drop policy if exists "Expense creator or admin can delete splits" on public.expense_splits;

create policy "Group Members can view splits"
on public.expense_splits
for select
to authenticated
using (
  exists (
    select 1
    from public.expenses e
    where e.id = expense_splits.expense_id
      and app_private.is_member_of_group(e.group_id)
  )
);

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

drop policy if exists "Creator profile or admin can update expense" on public.expenses;
drop policy if exists "Creator profile or admin can delete expense" on public.expenses;
drop policy if exists "Group members can add expenses" on public.expenses;
drop policy if exists "View expenses I created, in my groups, or where I’m a partici" on public.expenses;

create policy "View expenses I created, in my groups, or where I’m a partici"
on public.expenses
for select
using (
  created_by = app_private.get_current_profile_id()
  or app_private.is_member_of_group(group_id)
);

create policy "Group members can add expenses"
on public.expenses
for insert
with check (
  created_by = app_private.get_current_profile_id()
  and app_private.is_member_of_group(group_id)
);

create policy "Creator profile or admin can update expense"
on public.expenses
for update
using (
  created_by = app_private.get_current_profile_id()
  or app_private.is_group_admin(group_id)
)
with check (
  created_by = app_private.get_current_profile_id()
  or app_private.is_group_admin(group_id)
);

create policy "Creator profile or admin can delete expense"
on public.expenses
for delete
using (
  created_by = app_private.get_current_profile_id()
  or app_private.is_group_admin(group_id)
);

drop policy if exists "Admin can delete group" on public.groups;
drop policy if exists "Admin can update group" on public.groups;
drop policy if exists "Any user can create group" on public.groups;
drop policy if exists "Select groups I created or belong to" on public.groups;

create policy "Select groups I created or belong to"
on public.groups
for select
using (
  created_by = (select auth.uid())
  or exists (
    select 1
    from public.memberships m
    where m.group_id = groups.id
      and m.user_id = app_private.get_current_profile_id()
  )
);

create policy "Any user can create group"
on public.groups
for insert
with check (
  (select auth.uid()) is not null
);

create policy "Admin can update group"
on public.groups
for update
using (
  exists (
    select 1
    from public.memberships m
    where m.group_id = groups.id
      and m.user_id = app_private.get_current_profile_id()
      and m.role = 'admin'
  )
);

create policy "Admin can delete group"
on public.groups
for delete
using (
  exists (
    select 1
    from public.memberships m
    where m.group_id = groups.id
      and m.user_id = app_private.get_current_profile_id()
      and m.role = 'admin'
  )
);

drop policy if exists "Group members can add invoices" on public.invoices;
drop policy if exists "Uploader or admin can delete invoice" on public.invoices;
drop policy if exists "Uploader or admin can update invoice" on public.invoices;
drop policy if exists "View invoices I uploaded or in my groups or for expenses I’m " on public.invoices;

create policy "View invoices I uploaded or in my groups or for expenses I’m "
on public.invoices
for select
using (
  uploaded_by = (select auth.uid())
  or app_private.is_member_of_group(group_id)
  or exists (
    select 1
    from public.expenses e
    where e.id = invoices.expense_id
      and (
        e.created_by = app_private.get_current_profile_id()
        or exists (
          select 1
          from public.expense_splits es
          where es.expense_id = e.id
            and es.user_id = app_private.get_current_profile_id()
        )
      )
  )
);

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

create policy "Uploader or admin can update invoice"
on public.invoices
for update
using (
  uploaded_by = (select auth.uid())
  or app_private.is_group_admin(group_id)
);

create policy "Uploader or admin can delete invoice"
on public.invoices
for delete
using (
  uploaded_by = (select auth.uid())
  or app_private.is_group_admin(group_id)
);

drop policy if exists "Authenticated users can view memberships" on public.memberships;
drop policy if exists "User can remove self" on public.memberships;
drop policy if exists "Users can remove placeholder profiles" on public.memberships;
drop policy if exists "memberships_select_in_my_groups" on public.memberships;

create policy "memberships_select_in_my_groups"
on public.memberships
for select
using (
  app_private.is_caller_member_of_group(group_id)
);

create policy "User can remove self"
on public.memberships
for delete
using (
  user_id = app_private.get_current_profile_id()
);

create policy "Users can remove placeholder profiles"
on public.memberships
for delete
to authenticated
using (
  app_private.is_caller_member_of_group(group_id)
  and exists (
    select 1
    from public.profiles p
    where p.id = memberships.user_id
      and p.auth_user_id is null
  )
);

drop policy if exists "profiles_insert_placeholder" on public.profiles;
drop policy if exists "profiles_select_same_group" on public.profiles;
drop policy if exists "profiles_select_self" on public.profiles;
drop policy if exists "profiles_update_placeholder_name" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_upsert_self" on public.profiles;

create policy "profiles_select_self"
on public.profiles
for select
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = auth_user_id
);

create policy "profiles_select_same_group"
on public.profiles
for select
using (
  exists (
    select 1
    from public.memberships m_me
    join public.memberships m_tgt on m_tgt.group_id = m_me.group_id
    where m_me.user_id = app_private.get_current_profile_id()
      and m_tgt.user_id = profiles.id
  )
);

create policy "profiles_upsert_self"
on public.profiles
for insert
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = auth_user_id
);

create policy "profiles_insert_placeholder"
on public.profiles
for insert
with check (
  (select auth.uid()) is not null
  and auth_user_id is null
);

create policy "profiles_update_self"
on public.profiles
for update
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = auth_user_id
)
with check (
  (select auth.uid()) is not null
  and (select auth.uid()) = auth_user_id
);

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

drop policy if exists "View settlement_items in my groups" on public.settlement_items;
drop policy if exists "Insert settlement_items if member of group" on public.settlement_items;
drop policy if exists "Update settlement_items if payer or admin" on public.settlement_items;
drop policy if exists "Delete settlement_items if payer or admin" on public.settlement_items;

create policy "View settlement_items in my groups"
on public.settlement_items
for select
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_items.settlement_id
      and app_private.is_member_of_group(s.group_id)
  )
);

create policy "Insert settlement_items if member of group"
on public.settlement_items
for insert
with check (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_items.settlement_id
      and app_private.is_member_of_group(s.group_id)
  )
);

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
);

create policy "Delete settlement_items if payer or admin"
on public.settlement_items
for delete
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
);

drop policy if exists "View settlements in my groups" on public.settlements;
drop policy if exists "Insert settlements if member of group" on public.settlements;
drop policy if exists "Update settlements if payer or admin" on public.settlements;
drop policy if exists "Delete settlements if payer or admin" on public.settlements;

create policy "View settlements in my groups"
on public.settlements
for select
using (
  app_private.is_member_of_group(group_id)
);

create policy "Insert settlements if member of group"
on public.settlements
for insert
with check (
  app_private.is_member_of_group(group_id)
  and paid_by = (select auth.uid())
);

create policy "Update settlements if payer or admin"
on public.settlements
for update
using (
  paid_by = (select auth.uid())
  or app_private.is_group_admin(group_id)
)
with check (
  paid_by = (select auth.uid())
  or app_private.is_group_admin(group_id)
);

create policy "Delete settlements if payer or admin"
on public.settlements
for delete
using (
  paid_by = (select auth.uid())
  or app_private.is_group_admin(group_id)
);

drop policy if exists "View settlement shares in my groups" on public.settlement_shares;
drop policy if exists "Create settlement shares for my settlements" on public.settlement_shares;
drop policy if exists "Update settlement shares if creator or admin" on public.settlement_shares;
drop policy if exists "Delete settlement shares if creator or admin" on public.settlement_shares;

create policy "View settlement shares in my groups"
on public.settlement_shares
for select
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and app_private.is_member_of_group(s.group_id)
  )
);

create policy "Create settlement shares for my settlements"
on public.settlement_shares
for insert
with check (
  created_by = (select auth.uid())
  and exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        s.paid_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
);

create policy "Update settlement shares if creator or admin"
on public.settlement_shares
for update
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        settlement_shares.created_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        settlement_shares.created_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
);

create policy "Delete settlement shares if creator or admin"
on public.settlement_shares
for delete
using (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        settlement_shares.created_by = (select auth.uid())
        or app_private.is_group_admin(s.group_id)
      )
  )
);

revoke execute on function public.get_current_profile_id() from public, anon, authenticated;
revoke execute on function public.group_has_members(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.is_caller_member_of_group(uuid) from public, anon, authenticated;
revoke execute on function public.is_group_admin(uuid) from public, anon, authenticated;
revoke execute on function public.is_member_of_group(uuid) from public, anon, authenticated;
revoke execute on function public.remove_placeholder_profile_if_orphaned() from public, anon, authenticated;

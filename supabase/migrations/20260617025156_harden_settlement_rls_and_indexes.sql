create index if not exists idx_groups_created_by on public.groups(created_by);
create index if not exists idx_invoices_group_id on public.invoices(group_id);
create index if not exists idx_invoices_expense_id on public.invoices(expense_id);
create index if not exists idx_invoices_uploaded_by on public.invoices(uploaded_by);
create index if not exists idx_settlement_shares_created_by on public.settlement_shares(created_by);
create index if not exists idx_settlement_shares_settlement_id on public.settlement_shares(settlement_id);

alter table public.expenses
  drop constraint if exists expenses_created_by_fkey1;

drop policy if exists "View settlements in my groups" on public.settlements;
drop policy if exists "Insert settlements if member of group" on public.settlements;
drop policy if exists "Update settlements if payer or admin" on public.settlements;
drop policy if exists "Delete settlements if payer or admin" on public.settlements;

create policy "View settlements in my groups"
on public.settlements
for select
using (
  public.is_member_of_group(group_id)
);

create policy "Insert settlements if member of group"
on public.settlements
for insert
with check (
  public.is_member_of_group(group_id)
  and paid_by = auth.uid()
);

create policy "Update settlements if payer or admin"
on public.settlements
for update
using (
  paid_by = auth.uid()
  or public.is_group_admin(group_id)
)
with check (
  paid_by = auth.uid()
  or public.is_group_admin(group_id)
);

create policy "Delete settlements if payer or admin"
on public.settlements
for delete
using (
  paid_by = auth.uid()
  or public.is_group_admin(group_id)
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
      and public.is_member_of_group(s.group_id)
  )
);

create policy "Create settlement shares for my settlements"
on public.settlement_shares
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        s.paid_by = auth.uid()
        or public.is_group_admin(s.group_id)
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
        settlement_shares.created_by = auth.uid()
        or public.is_group_admin(s.group_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.settlements s
    where s.id = settlement_shares.settlement_id
      and (
        settlement_shares.created_by = auth.uid()
        or public.is_group_admin(s.group_id)
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
        settlement_shares.created_by = auth.uid()
        or public.is_group_admin(s.group_id)
      )
  )
);

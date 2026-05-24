alter table public.memberships
  drop constraint if exists memberships_group_id_fkey,
  add constraint memberships_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

alter table public.expenses
  drop constraint if exists expenses_group_id_fkey,
  add constraint expenses_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

alter table public.expense_splits
  drop constraint if exists expense_splits_expense_id_fkey,
  add constraint expense_splits_expense_id_fkey
    foreign key (expense_id) references public.expenses(id) on delete cascade;

alter table public.settlements
  drop constraint if exists settlements_group_id_fkey,
  add constraint settlements_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

alter table public.settlement_items
  drop constraint if exists settlement_items_settlement_id_fkey,
  add constraint settlement_items_settlement_id_fkey
    foreign key (settlement_id) references public.settlements(id) on delete cascade;

alter table public.settlement_items
  drop constraint if exists settlement_items_expense_id_fkey,
  add constraint settlement_items_expense_id_fkey
    foreign key (expense_id) references public.expenses(id) on delete cascade;

alter table public.invoices
  drop constraint if exists invoices_group_id_fkey,
  add constraint invoices_group_id_fkey
    foreign key (group_id) references public.groups(id) on delete cascade;

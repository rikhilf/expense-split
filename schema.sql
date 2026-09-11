--- SCHEMA FOR EXPENSE SPLIT APPLICATION
-- Using PostgreSQL with Supabase

-- PROFILES
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text not null,
  email text,
  avatar_url text,
  venmo_username text, -- optional handle for Venmo
  cashapp_username text, -- optional handle for Cash App
  paypal_username text, -- optional handle for PayPal
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- trigger set_profiles_updated_at exists

-- GROUPS
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'USD' check (currency = 'USD'),
  created_at timestamptz default timezone('utc', now()),
  created_by uuid not null references profiles(id)
);

-- MEMBERSHIPS
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  group_id uuid not null references groups(id) on delete cascade,
  role text not null default 'member',
  authenticated boolean not null default false,
  joined_at timestamptz default timezone('utc', now()),
  unique (user_id, group_id)
);

-- EXPENSES
create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references profiles(id), -- profiles.id so placeholder-aware app data stays profile-keyed
  paid_by uuid not null references profiles(id), -- actual payer, separate from recorder
  description text,
  amount numeric not null,
  date date not null,
  type text default 'manual',
  created_at timestamptz default timezone('utc', now())
);

-- EXPENSE_SPLITS
create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  user_id uuid not null references profiles(id),
  share numeric,
  amount numeric not null,
  unique (expense_id, user_id)
);

-- SETTLEMENTS (header)
create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  paid_by uuid not null references profiles(id),
  paid_to uuid not null references profiles(id),
  amount numeric not null check (amount > 0 and amount < 1000000000 and amount = round(amount,2)),
  status text not null default 'confirmed' check (status in ('pending','confirmed','voided')),
  initial_status text not null default 'confirmed' check (initial_status in ('pending','confirmed')),
  created_by uuid references profiles(id), -- nullable for imported legacy records only
  confirmed_by uuid references profiles(id),
  voided_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  payment_method text default 'other' check (payment_method in ('venmo','cashapp','paypal','cash','bank_transfer','other')),
  payment_date date,
  provider_reference text,
  idempotency_key uuid,
  settled_at timestamptz default timezone('utc', now()),
  note text,
  check (paid_by <> paid_to),
  unique (created_by,idempotency_key)
);

-- SETTLEMENT_ITEMS (line items)
create table settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  expense_id uuid not null references expenses(id) on delete cascade,
  expense_split_id uuid references expense_splits(id), -- optional explanation; balances derive from settlement headers
  amount numeric not null
);

-- RPCs, RLS grants, and deferred ledger validation triggers are defined in
-- supabase/migrations/20260910013850_implement_profile_settlements.sql.
-- Clients create expenses atomically and mutate settlements exclusively by RPC.

-- INVOICES (optional)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id) on delete cascade,
  uploaded_by uuid, -- auth.users.id (logical; no FK)
  source text,
  original_filename text,
  storage_path text,
  parsed_amount numeric,
  parsed_vendor text,
  parsed_due_date date,
  processed_at timestamptz default timezone('utc', now()),
  raw_email jsonb,
  expense_id uuid references expenses(id)
);

-- PUBLIC SHARE LINKS (future; read via Edge Function)
create table settlement_shares (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  token text not null unique,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  revoked_at timestamptz,
  mask_names boolean not null default true
);

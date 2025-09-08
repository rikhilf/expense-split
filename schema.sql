--- SCHEMA FOR EXPENSE SPLIT APPLICATION
-- Using PostgreSQL with Supabase

-- PROFILES
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  display_name text not null,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- trigger set_profiles_updated_at exists

-- GROUPS
create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default timezone('utc', now()),
  created_by uuid not null -- references auth.users.id (logical; no FK)
);

-- MEMBERSHIPS
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  group_id uuid not null references groups(id),
  role text not null default 'member',
  joined_at timestamptz default timezone('utc', now()),
  unique (user_id, group_id)
);

-- EXPENSES
create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  created_by uuid not null, -- auth.users.id (logical; no FK)
  description text,
  amount numeric not null,
  date date not null,
  type text default 'manual',
  created_at timestamptz default timezone('utc', now())
);

-- EXPENSE_SPLITS
create table expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id),
  user_id uuid not null references profiles(id),
  share numeric,
  amount numeric not null,
  unique (expense_id, user_id)
);

-- SETTLEMENTS (header)
create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  paid_by uuid not null, -- auth.users.id (logical; no FK)
  paid_to uuid not null, -- auth.users.id (logical; no FK)
  amount numeric not null,
  settled_at timestamptz default timezone('utc', now()),
  note text
);

-- SETTLEMENT_ITEMS (line items)
create table settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id),
  expense_id uuid not null references expenses(id),
  amount numeric not null
);

-- INVOICES (optional)
create table invoices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references groups(id),
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

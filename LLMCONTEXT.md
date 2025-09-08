LLM CONTEXT — Expense Split App (Supabase + Expo RN)

A single, accurate reference for future chats/agents. This reflects the current schema and decisions we made together. Update this as the code is updated.

0) High-level

Client: Expo React Native (TypeScript).

Backend: Supabase (Postgres + RLS), Supabase Edge Functions (Deno, service-role key).

Auth: Supabase Auth JWT.

Core model: groups contain memberships (linking to profiles). expenses are split per person via expense_splits. Users can record settlements (payments) that can cover multiple expenses via settlement_items.

Key ID rules

profiles.id = person key used inside app data (e.g., memberships.user_id, expense_splits.user_id).

auth.users.id = auth key used on edges (e.g., groups.created_by, expenses.created_by, settlements.paid_by/paid_to, invoices.uploaded_by).

Never put auth.users.id into expense_splits.user_id or memberships.user_id (must be profiles.id).

1) Current Schema (DDL-style summary)

Types/defaults reflect the intended state after our migrations. Some defaults/NOT NULLs were added; if old rows existed, we truncated before enforcing.

profiles
id              uuid pk default gen_random_uuid()
auth_user_id    uuid unique           -- links logically to auth.users.id
display_name    text not null
email           text
avatar_url      text
created_at      timestamptz not null default now()
updated_at      timestamptz not null default now()
-- Trigger: set_profiles_updated_at BEFORE UPDATE -> updates updated_at

groups
id              uuid pk default gen_random_uuid()
name            text not null
created_at      timestamptz default timezone('utc', now())
created_by      uuid not null         -- auth.users.id (logical; no FK)

memberships
id              uuid pk default gen_random_uuid()
user_id         uuid not null references profiles(id)
group_id        uuid not null references groups(id)
role            text not null default 'member'   -- 'member' | 'admin'
authenticated   boolean not null default false   -- true if profile is linked to an auth user
joined_at       timestamptz default timezone('utc', now())
unique(user_id, group_id)

expenses
id              uuid pk default gen_random_uuid()
group_id        uuid not null references groups(id)
created_by      uuid not null         -- auth.users.id (logical; no FK)
description     text
amount          numeric not null
date            date not null
type            text default 'manual'
created_at      timestamptz default timezone('utc', now())

expense_splits
id              uuid pk default gen_random_uuid()
expense_id      uuid not null references expenses(id)
user_id         uuid not null references profiles(id)
share           numeric               -- optional %/weight
amount          numeric not null
unique(expense_id, user_id)

settlements (payment header)
id              uuid pk default gen_random_uuid()
group_id        uuid not null references groups(id)
paid_by         uuid not null         -- auth.users.id (payer)
paid_to         uuid not null         -- auth.users.id (payee)
amount          numeric not null
settled_at      timestamptz default timezone('utc', now())
note            text
-- NOTE: we DROPPED settlements.expense_id to support multi-expense coverage.

settlement_items (allocation lines)
id              uuid pk default gen_random_uuid()
settlement_id   uuid not null references settlements(id)
expense_id      uuid not null references expenses(id)
amount          numeric not null

invoices (optional, for parsing/uploads)
id                 uuid pk default gen_random_uuid()
group_id           uuid references groups(id)
uploaded_by        uuid                      -- auth.users.id (logical)
source             text
original_filename  text
storage_path       text
parsed_amount      numeric
parsed_vendor      text
parsed_due_date    date
processed_at       timestamptz default timezone('utc', now())
raw_email          jsonb
expense_id         uuid references expenses(id)

settlement_shares (future: public share links, served via Edge Function)
id              uuid pk default gen_random_uuid()
settlement_id   uuid not null references settlements(id) on delete cascade
token           text not null unique
created_by      uuid                      -- auth.users.id
created_at      timestamptz not null default timezone('utc', now())
expires_at      timestamptz
revoked_at      timestamptz
mask_names      boolean not null default true


Key Indexes (non-exhaustive):

expense_splits unique (expense_id, user_id)

memberships unique (user_id, group_id) (+ idx on user_id)

Helpful: idx_* on foreign keys: expenses.group_id, expense_splits.expense_id, .user_id, settlements.group_id, .paid_by, .paid_to, settlement_items.settlement_id, .expense_id.

2) RLS — Philosophy & Active Policies

Anon key is public & safe because RLS is enforced.

Service role key bypasses RLS; only in Edge Functions / server.

We avoid recursion by:

Not querying memberships from memberships policies directly.

Using SECURITY DEFINER helper functions where a self-reference would be needed.

Helper Functions (canonical)
-- Map current JWT to profiles.id
create or replace function get_current_profile_id()
returns uuid language sql stable as $$
  select id from profiles where auth_user_id = auth.uid();
$$;

-- Membership check that avoids recursion when used in memberships policy
create or replace function is_caller_member_of_group(gid uuid)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare my_profile uuid;
begin
  select id into my_profile from profiles where auth_user_id = auth.uid();
  if my_profile is null then return false; end if;
  return exists (select 1 from memberships m where m.group_id = gid and m.user_id = my_profile);
end;
$$;


You also have is_member_of_group(gid) and is_group_admin(gid) in your DB; use them for non-memberships policies (no recursion risk). For memberships policies, prefer is_caller_member_of_group helper (SECURITY DEFINER) as above.

Groups

SELECT: creator or member can see.

INSERT: any authenticated user.

UPDATE/DELETE: group admin only.

Policy sketch:

USING (created_by = auth.uid()
   OR EXISTS (SELECT 1 FROM memberships m WHERE m.group_id = groups.id AND m.user_id = get_current_profile_id()))

Memberships

SELECT: only memberships of groups you belong to.

DELETE:

Self-remove: user_id = get_current_profile_id()

Any member can remove placeholder (profile where auth_user_id IS NULL):

USING (
  is_caller_member_of_group(group_id)
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = memberships.user_id AND p.auth_user_id IS NULL)
)


INSERT: done via Edge Function (invite_member) to avoid recursion and to enforce “any member can invite; only admins can grant admin”.

Expenses

SELECT: creator, or group member, or participant (has a split).

INSERT: group members.

UPDATE/DELETE: creator or group admin.

Expense Splits

INSERT: caller is member and the target user_id (profiles.id) is also a member of the expense’s group.

UPDATE/DELETE: the split’s participant or group admin.

Invoices

SELECT: uploader, group member, or participant in linked expense.

INSERT: uploader or group member.

UPDATE/DELETE: uploader or group admin.

Settlements

Typical: SELECT for payer/payee or any group member; INSERT/UPDATE/DELETE for group members (you can tighten to payer/admin if desired).

Settlement Items

SELECT / INSERT: members of the settlement’s group.

UPDATE/DELETE: payer of the settlement or group admin.

3) Triggers (placeholder lifecycle)

We decided:

Placeholders (profiles.auth_user_id IS NULL) should not exist in multiple groups.

When a placeholder is removed from its last group, delete the profile.

Before INSERT on memberships:

prevent_placeholder_in_multiple_groups()
-- if NEW.user_id is placeholder and already has a membership, raise exception.


After DELETE on memberships:

remove_placeholder_profile_if_orphaned()
-- if OLD.user_id is placeholder and now has 0 memberships (and no other refs), delete from profiles.


These are SECURITY DEFINER, run as owner, and don’t trigger RLS recursion.

4) Edge Functions (service role) — what exists & planned
Implemented

create_group_and_seed_admin

Requires user JWT.

Ensures a profiles row for caller.

Inserts groups (created_by = auth.users.id) and seeds memberships (user_id = caller’s profiles.id, role=admin).

invite_member

Allows any current member to invite with role member.

Allows only current admins to grant role admin.

Accepts either profile_id or email.

If email and no profile exists, creates a placeholder (auth_user_id=NULL) profile and inserts membership.
Sets memberships.authenticated based on whether the target profile has a non-null auth_user_id.

Idempotent: returns existing membership if already present.

Planned (pattern established)

create_expense_with_splits

Validates caller membership.

Inserts expenses and batch expense_splits (using profiles.id).

apply_settlement_bundle

Inserts one settlement and N settlement_items for selected expenses.

Validates both paid_by and paid_to are members.

Calling pattern (client):

Pass Authorization: Bearer <user_jwt>.

Never expose the service-role key to the client.

Secrets:

SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY set via supabase secrets set ....

Local dev via supabase/.env.local and supabase functions serve --env-file.

5) Invariants & Calculations

Expense distribution: expense_splits has unique (expense_id, user_id). The sum of amount over splits should equal the expense amount (enforced in code; optional DB constraint later).

Settlement coverage: sum of settlement_items.amount ≤ settlements.amount. Partial coverage supported.

Balances / Simplification:

Running nets and debt-minimization are computed in app/Edge Function for now (no SQL RPC required yet).

You can optionally add SQL views or RPCs later, but not necessary for MVP.

6) Common pitfalls (and our decisions)

Profile vs Auth IDs

Internals (splits, memberships) use profiles.id.

Edge/creator/payer fields use auth.users.id.

Membership inserts

Client-side INSERT on memberships causes recursion headaches if the policy checks membership. We delegated this to an Edge Function.

Placeholders

Created with auth_user_id = NULL (RLS policy allows this).

Limited to one group (trigger).

Auto-deleted when last membership is removed (trigger).

Public share of settlements

Via settlement_shares + Edge Function with token. Do not expose data via public RLS.

7) Minimal policy snippets (ready-to-use patterns)

Names can differ; use these as the intended logic.

-- groups SELECT
create policy "Select groups I created or belong to"
on groups for select
using (
  created_by = auth.uid()
  or exists (
    select 1 from memberships m
    where m.group_id = groups.id
      and m.user_id = get_current_profile_id()
  )
);

-- memberships SELECT
create policy "memberships_select_in_my_groups"
on memberships for select
using (is_caller_member_of_group(group_id));

-- memberships DELETE: self
create policy "User can remove self"
on memberships for delete
using (user_id = get_current_profile_id());

-- memberships DELETE: any member can remove placeholder
create policy "Any member can remove placeholder"
on memberships for delete
using (
  is_caller_member_of_group(group_id)
  and exists (
    select 1 from profiles p
    where p.id = memberships.user_id
      and p.auth_user_id is null
  )
);

-- Alternatively, if you prefer to drive placeholder logic via memberships.authenticated,
-- mirror the policy to check (memberships.authenticated = false) instead of profiles.auth_user_id is null.

-- expenses INSERT (member)
create policy "Group members can add expenses"
on expenses for insert
with check (
  exists (
    select 1 from memberships m
    where m.group_id = expenses.group_id
      and m.user_id = get_current_profile_id()
  )
);

-- expense_splits INSERT (caller is member & target is member)
create policy "Group members can add splits"
on expense_splits for insert
with check (
  exists (
    select 1 from expenses e
    where e.id = expense_splits.expense_id
      and exists (
        select 1 from memberships m
        where m.group_id = e.group_id
          and m.user_id = get_current_profile_id()
      )
  )
  and exists (
    select 1 from expenses e
    join memberships mt on mt.group_id = e.group_id
    where e.id = expense_splits.expense_id
      and mt.user_id = expense_splits.user_id
  )
);

8) Environment & secrets (Expo + Supabase)

Anon key is public and must ship in the app bundle; protected by RLS.

Service role key is secret; only in Edge Functions / server env.

Ignore .env in git; keep local-only envs. Use app.config.js/app.json for safe public config.

9) Open TODOs / Next steps

Implement and deploy:

create_expense_with_splits Edge Function.

apply_settlement_bundle Edge Function.

Add UI for:

Viewing a settlement’s linked settlement_items (per-expense breakdown).

Inviting by email and showing placeholder status.

(Optional) Add DB CHECKs for sums (splits vs expense total; settlement_items vs settlement total) if you want hard guarantees.

(Optional) Add is_caller_admin_of_group(gid uuid) SECURITY DEFINER and admin-only delete policies.

10) Sanity Queries
-- My profile id
select get_current_profile_id();

-- Am I a member of group X?
select is_caller_member_of_group('00000000-0000-0000-0000-000000000000');

-- Members of a group (with emails)
select m.id membership_id, p.id profile_id, p.display_name, p.email, m.role
from memberships m
join profiles p on p.id = m.user_id
where m.group_id = '...';

-- Placeholder members in a group
select m.id, p.id profile_id, p.email
from memberships m
join profiles p on p.id = m.user_id
where m.group_id = '...'
  and p.auth_user_id is null;

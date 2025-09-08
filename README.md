# Expense Split

A mobile app for splitting expenses with friends, built with Expo (React Native) and Supabase (Postgres + Auth + Edge Functions).

<p align="center">
  <em>Create groups, add expenses, split fairly, and settle up.</em>
</p>

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Run the App](#run-the-app)
- [Supabase Setup](#supabase-setup)
  - [Schema](#schema)
  - [Edge Functions](#edge-functions)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)

## Features
- Create groups and invite members (by email or placeholder names)
- Add expenses and split per member
- Record settlements that can cover multiple expenses
- Email/password and OAuth sign-in (Google, Apple)
- Secure by default with Supabase RLS

## Tech Stack
- Expo React Native (TypeScript)
- Supabase: Postgres, Auth, Edge Functions
- Jest + Testing Library (unit tests)

## Getting Started

### Prerequisites
- Node 18+ and npm
- Expo CLI (`npm i -g expo`) and optionally the Expo Go app on your device
- A Supabase project (or Supabase CLI for local dev)

### Installation
```bash
npm install
```

### Environment Variables
Create `.env` in this folder with your public Supabase credentials (anon key is safe to ship thanks to RLS):
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```
These are loaded by `app.config.js` via `dotenv/config` and exposed to the app through `expo.extra`.

### Run the App
```bash
# Start Metro
npm run start

# iOS simulator
npm run ios

# Android emulator
npm run android

# Web
npm run web
```

Sign up or sign in from the app screens. For OAuth in development, add a redirect in Supabase Auth: `expense-split://auth/callback` (matches the `scheme` in `app.config.js`).

## Supabase Setup

### Schema
The canonical schema is in:
- `schema.sql`

It defines:
- `profiles` (app users, internally referenced by `profiles.id`)
- `groups`, `memberships` (membership links use `profiles.id`)
- `expenses`, `expense_splits`
- `settlements`, `settlement_items`
- optional `invoices`, `settlement_shares`

RLS policies and design notes are documented in:
- `LLMCONTEXT.md`

### Edge Functions
The app uses two functions:
- `create_group_and_seed_admin`: Creates a group and adds the caller as admin.
- `invite_member`: Invite by existing profile or email (creates a placeholder profile if needed). Any member can invite; only admins can grant admin.

Local development:
```bash
# 1) Optional: start a local Supabase stack
supabase start

# 2) Provide service secrets to functions
#    (or set via `supabase secrets set ...`)
cat > supabase/.env.local <<EOF
URL=your_supabase_url
SERVICE_ROLE_KEY=your_service_role_key
EOF

# 3) Serve functions locally with env
supabase functions serve --env-file supabase/.env.local
```

Deploy to your Supabase project:
```bash
supabase functions deploy create_group_and_seed_admin invite_member
supabase secrets set --env-file supabase/.env.local
```

Notes:
- Functions require a user JWT (the app calls them via `supabase.functions.invoke(...)` after sign-in).
- Service role key is only used in Edge Functions and never shipped in the app.

## Testing
```bash
npm test
```
Tests mock the Supabase client and cover hooks like `useGroups`, `useMembers`, and expense flows.

## Project Structure
```
.
├─ app.config.js              # Loads .env and exposes values to Expo
├─ schema.sql                 # DB schema reference
├─ src/
│  ├─ lib/supabase.ts        # Supabase client (uses expo extra values)
│  ├─ hooks/                 # React hooks (groups, members, expenses)
│  ├─ types/                 # Generated DB types + app types
│  └─ screens/               # SignIn/SignUp, Groups, etc.
└─ supabase/
   ├─ config.toml            # Functions config
   ├─ .env.local             # Local function secrets (URL, SERVICE_ROLE_KEY)
   └─ functions/
      ├─ create_group_and_seed_admin/
      └─ invite_member/
```

## Troubleshooting
- Missing env vars: Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in `.env`.
- OAuth callback: Set redirect URL in Supabase Auth to `expense-split://auth/callback`.
- 401 from functions locally: Ensure you’re signed in (functions require a user JWT) or test via curl with a valid JWT.
- RLS errors: Ensure policies from `LLMCONTEXT.md` are applied (memberships/expenses/expense_splits are the usual culprits).

## Security Notes
- The anon key is public by design (enforced by RLS).
- Never expose the service role key in the app; keep it only in Edge Functions via Supabase secrets.

---

For deeper technical details (schema, RLS, helper functions, invariants), see `LLMCONTEXT.md`.
- [ ] Implement invoice parsing (future feature)
- [ ] Add push notifications
- [ ] Add offline support

### Known Issues
- Some Supabase queries may need optimization for complex joins
- OAuth redirect URLs need to be configured in Supabase
- Custom expense shares feature needs backend implementation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License. 

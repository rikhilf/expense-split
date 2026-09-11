# Repository Guidelines

## Project Structure & Module Organization
The Expo entry lives in `App.tsx`, while shared logic sits under `src/` (contexts, hooks, lib, navigation, screens, types). Supabase SQL, migrations, and triggers are tracked in `schema.sql` and `supabase/`. Edge Functions (`supabase/functions/*`) run with the service-role key for workflows such as group creation, inviting members, updating placeholder profiles, updating expenses, and deleting a group when the last authenticated member leaves. Assets (fonts, images) stay under `assets/`, and runtime config flows through `app.config.js` and `supabase.ts`.

## Build, Test, and Development Commands
Run `npm run start` to launch the Metro bundler; use `npm run android`, `npm run ios`, or `npm run web` for the direct platform scripts. You can also append `--android`, `--ios`, or `--web` to `npm run start` if you prefer the Expo CLI flow. Use `npm test` (or `npm test -- --watch`) to execute Jest with the Expo preset. When editing SQL or Edge Functions, update Supabase locally (`supabase db push` or SQL console) before committing to keep the app and backend aligned.
Expo loads environment variables from `.env.local` first and then `.env` via `app.config.js`, so keep `SUPABASE_URL` and `SUPABASE_ANON_KEY` available for local app runs. For Edge Functions, start a local stack with `supabase start`, serve functions with `supabase functions serve --env-file supabase/.env.local`, and deploy with `supabase functions deploy create_group_and_seed_admin invite_member update_placeholder_profile delete_group_if_last_member update_expense` plus `supabase secrets set --env-file supabase/.env.local`.

## Coding Style & Naming Conventions
Write TypeScript with 2-space indentation. Keep React components functional and colocate hooks/contexts in `src/hooks` and `src/contexts`. Name screens as `PascalCaseScreen.tsx`, hooks as `useThing.ts`, and Supabase helper modules with clear nouns (e.g., `profiles.ts`). Maintain import ordering (external packages, shared utilities, feature files) and rely on editor-integrated Prettier/ESLint settings from Expo.

## Testing Guidelines
Unit tests reside in `__tests__` folders beside their hooks (`*.test.ts`). Prefer Testing Library helpers (`renderHook`, `waitFor`) and mock Supabase clients using existing utilities in `src/lib`. Cover asynchronous branches that touch memberships, expense splits, and settlements; ensure new data flows include at least one regression test referencing the relevant schema behavior.

## Supabase & Data Safety
Use `profiles.id` for memberships, splits, expense creators/payers, group creators, and settlement participants/audit actors. `profiles.auth_user_id` maps authentication identities to profiles; placeholder participants have no auth ID. Never bypass policies from the client. Settlement balances derive from confirmed payment headers; optional `settlement_items` explain allocation and must not be counted again. Financial mutations use atomic RPCs. See `SETTLEMENTS.md` for lifecycle and history rules.

## Commit & Pull Request Guidelines
Follow the existing short, present-tense message style (`Add profile pages for other group members`). Each PR should describe the change, outline Supabase updates (DDL, Edge Functions), list manual test steps, and attach UI captures when screens shift. Reference open TODOs (Edge Functions for bundled expenses, admin utilities) if your work advances them.

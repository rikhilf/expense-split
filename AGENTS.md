# Repository Guidelines

## Project Structure & Module Organization
The Expo entry lives in `App.tsx`, while shared logic sits under `src/` (contexts, hooks, lib, navigation, screens, types). Supabase SQL, migrations, and triggers are tracked in `schema.sql` and `supabase/`. Edge Functions (`supabase/functions/*`) run with the service-role key for workflows such as group creation and placeholder updates. Assets (fonts, images) stay under `assets/`, and runtime config flows through `app.config.js` and `supabase.ts`.

## Build, Test, and Development Commands
Run `npm run start` to launch the Metro bundler; append `--android`, `--ios`, or `--web` to target a platform. Use `npm test` (or `npm test -- --watch`) to execute Jest with the Expo preset. When editing SQL or Edge Functions, update Supabase locally (`supabase db push` or SQL console) before committing to keep the app and backend aligned.

## Coding Style & Naming Conventions
Write TypeScript with 2-space indentation. Keep React components functional and colocate hooks/contexts in `src/hooks` and `src/contexts`. Name screens as `PascalCaseScreen.tsx`, hooks as `useThing.ts`, and Supabase helper modules with clear nouns (e.g., `profiles.ts`). Maintain import ordering (external packages, shared utilities, feature files) and rely on editor-integrated Prettier/ESLint settings from Expo.

## Testing Guidelines
Unit tests reside in `__tests__` folders beside their hooks (`*.test.ts`). Prefer Testing Library helpers (`renderHook`, `waitFor`) and mock Supabase clients using existing utilities in `src/lib`. Cover asynchronous branches that touch memberships, expense splits, and settlements; ensure new data flows include at least one regression test referencing the relevant schema behavior.

## Supabase & Data Safety
Respect ID separation: `profiles.id` belongs in memberships and splits, while `auth.users.id` populates creator fields (`groups.created_by`, `expenses.created_by`, `settlements.paid_by/paid_to`). RLS assumes callers fetch via `get_current_profile_id()` helpers—never bypass policies from the client. Sync triggers (e.g., `set_profiles_updated_at`) and default timestamps when editing schema, and verify that settlements link through `settlement_items` rather than a single expense.

## Commit & Pull Request Guidelines
Follow the existing short, present-tense message style (`Add profile pages for other group members`). Each PR should describe the change, outline Supabase updates (DDL, Edge Functions), list manual test steps, and attach UI captures when screens shift. Reference open TODOs (Edge Functions for bundled expenses, admin utilities) if your work advances them.

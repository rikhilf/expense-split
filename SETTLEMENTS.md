# Settlements

Implemented on `feature/profile-settlements`. This document supersedes the older
auth-ID settlement examples in LLMCONTEXT.md. Project trajectory lives in
PROJECT_GOALS.md.

## Ledger model

Every participant and audit actor uses `profiles.id`, including placeholders.
An expense has both `created_by` (who entered it) and `paid_by` (who funded it).
Existing expenses are backfilled with `paid_by = created_by`. Administrators can
record expenses for another payer. Each group currently uses USD.

For each profile, balance is expense payments minus assigned expense shares,
plus confirmed settlements sent, minus confirmed settlements received. Positive
means money is owed to the profile; negative means the profile owes money.
Expense shares remain unchanged when a settlement is recorded. Optional
settlement_items are explanatory allocations and never counted a second time.
The current UI records payments against the whole group balance.

Suggestions pair debtors and creditors deterministically using integer cents.
They reduce payment steps but do not promise the mathematically smallest possible
number of transfers. A suggestion is not a payment record.

## Payment lifecycle

### Current manual flow (2026-09-11)

New entries use `record_settlement`, an atomic, idempotent RPC that records completed
payments immediately. The old sent/completed toggle is removed. `confirmed` remains
the internal ledger status and is displayed as “Recorded”. Existing pending records
remain visible and can be confirmed or canceled; none were automatically converted.

Payers choose **Record payment** (default) or **Pay now**. Recording needs payer,
recipient, amount, payment date, and an optional note; method may be unspecified.
Recipients and admins recording other members only get the recording flow. No
payment handles or provider accounts are required to log a payment.

Pay now offers Venmo, Cash App, and PayPal. The recipient handle can be entered for
this payment; it is not written over their profile. After reviewing, opening Venmo
attempts its native payment route with recipient, amount, and note, falling back to
HTTPS if the app cannot open. Cash App/PayPal use HTTPS payment links. Prefill and
app handoff are best effort and require device verification. Provider authentication
may drop prefilled fields. Users must verify the actual recipient and amount.
Opening or returning from an app never records a payment. The user explicitly
records completion after paying; canceling the provider flow leaves the ledger alone.

iOS uses a native `pageSheet` modal with automatic content insets; Android/web retain
a raised, keyboard-aware fallback. Month/year history initially shows three months,
with “Load older months”. Old pending records stay visible regardless of date.
All ledger pages are fetched in chunks to support complete balance explanations.
The monthly control limits rendered history, not network retrieval. No retention
deletion is enabled. `payment_date` is distinct from entry time; legacy records use
their entry date as a display fallback without guessing historical payment dates.

### Status compatibility

Verification for this pass: 111 Jest tests, TypeScript, and web production export
pass. Both rollback SQL suites (`settlements.sql` and
`record_completed_settlements.sql`) pass on the connected project. The
`record_completed_settlements` migration is deployed. Security advisors reported
only the previously documented platform findings below, with no new function
findings. iOS sheet layout, keyboard behavior, and real provider handoff still
require device acceptance; no real payment was sent during verification.

Balances is accessed through the group header's “View balances & settle up” button.
Each member's expandable breakdown shows signed expense payments, shares, and
confirmed payments, with links back to the expenses. Details must reconcile with
the server balance before an itemized total is displayed; mismatches request a refresh.

The action is “Settle up” for the payer, “Record received payment” for the recipient,
and “Record payment for members” for an uninvolved admin. Ordinary members can only
select pairs involving themselves. An admin recording another pair is the recorder,
not the payer; their own balance is unaffected. This is distinct from personally
funding another member's debt, which would require a separate reimbursement/gift
model and is not implemented by adding an extra identity field alone.

- **Pending (legacy clients/records only):** the payer or an administrator marks money as sent. Balances stay
  unchanged. The recipient or an administrator confirms receipt.
- **Confirmed:** a payment affects balances. A participant or an administrator
  can also record a payment that has already happened, after reviewing and
  explicitly confirming the record.
- **Voided:** a participant or administrator cancels/undoes the record. It stays
  in history with its original amount, participants, actor, and void reason.
  This reverses the balance adjustment, not an external bank transfer.

Correct a pending payment by cancelling its record and creating a replacement.
Confirmed payment amounts and participants cannot be edited. Actor IDs and event
timestamps preserve who recorded, confirmed, or voided the payment. Repeating a
confirmation or void has no additional effect. Create retries reuse an operation
key so a retry cannot create a second payment.

Partial payments are supported. The server rejects self-payments, outsiders,
nonpositive amounts, fractional cents, and payments larger than both the payer's
remaining debt and the recipient's remaining credit. It checks balances again
at confirmation, so overlapping pending payments cannot over-settle the ledger.
Pending payments remain visible: check them before sending money again.

Payment profile links open Venmo, Cash App, or PayPal. Users verify the recipient
and enter/check the amount there. Opening a link does not create or confirm a
payment. These integrations do not transfer money or verify provider completion.

## Integrity and corrections

Expense creation and split replacement are atomic. Database functions validate
the payer, group membership, and exact split total. Deferred triggers protect
changed expense totals at transaction completion. Financial operations lock the
group while checking and writing to avoid racing confirmations.

Legacy data is not guessed or redistributed. The initial inspection found 8 of
11 existing expenses had inconsistent split totals, including 5 with no splits.
Affected groups show a correction error and reject settlement creation and
confirmation until their expenses are fixed. Review each expense and save its
intended payer, amount, and participant shares. Historical payments can still
be reviewed or voided when balance calculation is unavailable.

Editing an expense recomputes balances and may reopen debt; existing payments
remain in history. Deleting an expense is blocked while its group has confirmed
payments. Void the affected payment records first or correct the expense through
Edit. Existing member-removal UI also conservatively preserves split history;
the database additionally rejects removal with debt or pending payments. Explicit
whole-group deletion retains the application's existing destructive confirmation.

## Backend and tests

The migration adds profile foreign keys and audited settlement fields, removes
direct client write access to financial tables, and exposes authenticated RPCs:

- `get_group_balances`
- `create_settlement`
- `confirm_settlement`
- `void_settlement`
- `create_expense_with_splits`

The existing `update_expense` Edge Function calls the strengthened atomic
`update_expense_with_splits` database function, including the explicit payer.
Public wrappers run as invoker; private implementations perform explicit
authentication and authorization with restricted execution grants.

Run `npm test -- --runInBand` and `npx tsc --noEmit` for app tests and type checks.
`supabase/tests/settlements.sql` exercises real PostgreSQL behavior using random
fixtures and authenticated roles inside a transaction that rolls back everything.
It covers profile identity, permission denial, partial payments, pending receipt,
voids, retries, stale overlapping payments, invalid inputs, history protection,
and incomplete legacy data. Run it through Supabase MCP `execute_sql` as owner.

Manual acceptance: create a three-person group with a placeholder, enter a $90
expense split $30 each, mark a $20 payment pending, confirm receipt, verify the
remaining debt is $10, and void the payment to restore the original debt. Also
open a provider profile and confirm that balances remain unchanged.

Verification on 2026-09-09: 83 Jest tests pass, TypeScript passes, web production
export succeeds, and the rollback SQL integration suite passes on the connected
Expense Split Supabase project. The migration and updated expense-edit Edge
Function are deployed. Test fixtures leave no persistent rows. Native payment
app routing still needs device verification.

Supabase advisors flagged existing platform maintenance items outside this
feature: three legacy functions with [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
and [available Postgres security patches](https://supabase.com/docs/guides/platform/upgrading).
None of the new settlement functions appeared in the security findings.

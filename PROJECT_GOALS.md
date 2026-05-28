# Project Goals and Feasibility

Last reviewed: 2026-05-24

## Product direction

Expense Split should work even when only one person in a group has the app. The app is the system of record for creating groups, tracking expenses, splitting amounts, and recording settlements. Non-app participants should be able to open a secure web link, review the expense detail, and pay through a payment app link without creating an account.

The long-term automation goal is to reduce manual entry for recurring shared costs. The original idea was email or invoice parsing for bills such as rent, electricity, internet, and subscriptions. The expanded scope includes receipt image parsing and card or bank transaction linking. Receipt parsing should extract key line items from an image, support multilingual receipts, and let the user quickly assign each item or subtotal to group members. Transaction linking should detect eligible debit and credit card transactions, classify them as commonly split expenses, and surface them for user confirmation.

## Public expense links

Feasibility: high.

Recommended approach:

- Add public share links for expense details, similar to the existing future `settlement_shares` concept.
- Serve public data through an Edge Function by opaque token, not through public RLS policies.
- Keep the public payload minimal: expense description, date, total, split amount owed, payer/payee display names, and payment links.
- Support expiration and revocation.
- Add optional masking for participant names and group names.
- Treat public links as bearer tokens: anyone with the URL can view the shared payload.

Payment behavior:

- Store payment handles on profiles (`venmo_username`, `cashapp_username`, `paypal_username` already exist in the schema).
- For Cash App, payment links are feasible and can open a prefilled payment flow when using Cash App payment links.
- For Venmo, simple profile links are feasible, but reliable amount/note prefill through web links should be treated as best-effort unless verified in the current Venmo app/web behavior before launch.
- Do not mark an expense as paid just because a payment link was opened. The app should record settlement only after payer confirmation, payee confirmation, webhook support from a payment provider, or manual reconciliation.

Open product decision:

- Decide whether public links show the full expense or a recipient-specific view. The safer default is a recipient-specific token that only reveals what that person owes.

## Email and invoice parsing

Feasibility: medium.

Email parsing is useful for recurring bills that have invoices before payment, line-item detail, due dates, service periods, or usage data. It is less useful for ad hoc transactions and requires sensitive mailbox or forwarded-email handling.

Recommended approach:

- Keep invoice parsing as an optional later workflow.
- Prefer user-forwarded emails or uploaded PDFs over full mailbox access.
- Parse into a draft expense that must be confirmed by the user before notifying the group.
- Store raw email/PDF content only when necessary, and prefer extracting structured fields then deleting or retaining raw content for a limited period.

Invoice parsing should not be the first automation path unless recurring utility/rent bills are the main use case.

## Receipt image parsing

Feasibility: medium to high.

Receipt parsing is a strong fit for the product because it supports item-level splitting after shared purchases, such as groceries, restaurants, household supplies, travel purchases, and mixed personal/shared baskets.

Core workflow:

- User captures or uploads a receipt image.
- App runs OCR and receipt understanding.
- App extracts merchant, date, subtotal, taxes, tip, total, and line items with prices.
- User reviews and corrects extracted items.
- User assigns each line item to one or more group members.
- App allocates tax, tip, discounts, and fees proportionally unless the user overrides them.
- App creates one expense with item-level allocation metadata and normal `expense_splits` totals.

Multilingual requirements:

- OCR should support multiple scripts and languages, not only English.
- The parser should preserve original item text and optionally store normalized/translated labels separately.
- Currency, decimal separators, tax labels, discounts, and receipt layouts vary by locale and must be handled as parsing features, not hardcoded English strings.
- Confidence scores should drive the UI. Low-confidence receipts should open directly in review mode instead of silently creating splits.

Implementation options:

- On-device OCR: good for privacy and fast capture. Apple Vision can recognize text in images and supports language configuration; Google ML Kit Text Recognition v2 supports many languages/scripts, including separate support for Chinese, Devanagari, Japanese, and Korean scripts.
- Server-side receipt extraction: better for structured receipt/invoice fields and line-item grouping. AWS Textract AnalyzeExpense, for example, returns summary fields and receipt line-item groups, but cloud processing means receipt images leave the device.
- Hybrid: run OCR on device, send only OCR text and bounding boxes to the backend for parsing, or keep parsing local when the user enables privacy-first mode.

Recommended MVP:

- Start with image upload/capture, OCR text extraction, editable line-item review, and manual assignment controls.
- Do not require perfect automatic parsing. The primary value is faster item entry plus a polished correction flow.
- Store the final reviewed structure, not just raw OCR, so future edits and audit views are possible.
- Make raw image retention explicit. Default to deleting raw images after parsing unless the user chooses to keep them.

Future enhancements:

- Item grouping for duplicate line items.
- Split-by-person shortcuts, such as "assign all unclaimed to everyone" or "assign selected items to Alex and Priya."
- Learned merchant-specific parsing corrections.
- Translation or display normalization for multilingual receipts while preserving original text.
- Suggested assignment based on prior purchases, dietary preferences, or historical item ownership, with user confirmation.

## Card and bank transaction linking

Feasibility: medium to high for a server-assisted implementation; low for a fully on-device implementation across all banks and cards.

Aggregator-backed linking:

- Plaid-style transaction linking can retrieve checking, savings, credit card, and loan transactions, including merchant, amount, date, category, and related enrichment fields.
- This requires a backend component to create link tokens, exchange public tokens for access tokens, call the transactions API, receive webhooks, and refresh transaction data.
- The app should store provider item/account metadata and transaction fingerprints or IDs, then store only the fields needed for split detection.
- Transactions are not guaranteed to arrive in real time. The UX should be "new possible split detected" rather than "instant card charge notification."

Fully on-device linking:

- A completely on-device bank-linking model is not broadly feasible if the app needs to support arbitrary banks and cards. Banks and aggregators generally expose transaction data through server-side APIs or OAuth flows that require backend token handling.
- Apple FinanceKit can expose eligible Apple Wallet financial data with user consent, but it is platform-limited and does not replace bank aggregation for all institutions or Android.
- Local-only import can work for manual CSV uploads, screenshots, or user-entered recurring rules, but that is not automatic card linking.

Recommended scope:

- Phase 1: manual expenses plus public expense links and payment handles.
- Phase 2: receipt image parsing with editable item assignment.
- Phase 3: recurring expense templates and lightweight reminders.
- Phase 4: optional Plaid-style transaction linking as a privacy-explicit feature.
- Phase 5: optional invoice/email parsing for bills where transaction data is insufficient.

## Can transaction linking replace invoice parsing?

Partially, but not completely.

Transaction linking can replace invoice parsing for many card-paid shared expenses:

- groceries
- restaurants
- household supplies
- subscriptions
- utilities after payment posts

Receipt parsing can replace transaction linking or invoice parsing for item-level in-person purchases where the user has the receipt image. It is especially useful when a single transaction includes both shared and personal items.

It does not fully replace invoice parsing for:

- bills that need to be split before payment is made
- rent or utilities paid by ACH/check/cash outside a linked card
- invoices with service periods, line items, usage, late fees, or account-specific details
- bills where the transaction merchant is ambiguous
- cases where a user wants auditability from the original bill

Receipt parsing also does not replace transaction linking for missing receipts, automatic recurring detection, or cases where the user wants the app to detect a shared purchase without manual capture.

The recommended product model is not "transaction linking versus invoice parsing." It is "transaction linking creates candidate expenses; invoice parsing handles bill documents when transaction data is too late or too thin."

## Classification model

Feasibility: high for simple local classification; medium for personalized high-accuracy automation.

Start without a heavy ML model:

- Use deterministic rules first: merchant allowlist, amount thresholds, recurrence detection, group-specific vendors, user exclusions, and category filters.
- Use provider category and merchant enrichment where available.
- Ask the user to confirm suggested expenses.
- Learn from confirmations with local or server-side rules, such as "always split Trader Joe's over $30 with Housemates."

On-device ML:

- A small on-device classifier is feasible and cheap to run. Transaction classification is a small text/tabular problem; it does not require a large language model.
- Inputs can be merchant name, normalized description, amount bucket, day of week, category, account type, recurrence features, and user-specific rules.
- Runtime options include platform-native models such as Core ML on iOS and mobile inference runtimes such as ONNX Runtime or TensorFlow Lite.
- With Expo, native ML runtimes may require a custom dev client or prebuild workflow instead of plain Expo Go.

Privacy-preserving design:

- Keep model inference on device when possible.
- Store user-specific rules locally first.
- Only upload confirmed expenses, not the full transaction feed, if using a privacy-first mode.
- If aggregator sync happens on the backend, provide a clear privacy mode that stores only candidate transactions or derived fingerprints and deletes ignored transactions.

Recommended model strategy:

1. Launch with rules plus user confirmation.
2. Add personalized local rules from user decisions.
3. Add a compact on-device classifier only after there is enough labeled behavior to improve over rules.
4. Avoid hosted LLM classification for raw transaction feeds unless users explicitly opt in.

## Data model implications

Likely additions:

- `expense_shares` or `expense_public_links` for public expense detail links. This may be separate from `settlement_shares` because the link target is an expense/split detail, not a recorded settlement.
- `payment_handles` can remain on `profiles` for now, but may later move to a separate table if users need multiple handles per provider.
- `receipts` for uploaded/captured receipt metadata, OCR status, raw-image retention policy, locale, currency, and confidence.
- `receipt_line_items` for extracted item labels, prices, quantities, discounts, bounding boxes, confidence, and original OCR text.
- `receipt_item_assignments` for item-level allocation to profiles before rolling up to `expense_splits`.
- `linked_accounts` for provider item/account metadata.
- `external_transactions` or `transaction_candidates` for transaction sync and candidate split detection.
- `recurring_rules` for user-approved merchant/category/amount patterns.
- `automation_suggestions` for pending candidate expenses and notification state.

Security defaults:

- Public links must be served by Edge Function token lookup.
- Do not expose group tables directly to anonymous users.
- Do not store full raw transaction payloads unless there is a clear user-visible need.
- Do not retain raw receipt images by default unless needed for audit or correction.
- Prefer draft expenses for automation. Group notifications should happen after the owner confirms.

## Current recommendation

Build the non-app participant flow first. It is the clearest differentiator and fits the current Supabase/Expo architecture.

Then build automation in this order:

1. Recurring templates and reminders.
2. Receipt image parsing with editable item assignment.
3. Payment handles and public expense payment links.
4. Transaction candidate detection with provider categories and deterministic rules.
5. Optional on-device classifier for better personalized suggestions.
6. Invoice/email parsing for bills where linked transactions are not enough.

This keeps the product useful before sensitive financial automation exists, avoids premature ML complexity, and leaves a clean path to privacy-focused transaction automation.

## External references checked

- Plaid Transactions: https://plaid.com/docs/transactions/
- Plaid Link token flow: https://plaid.com/docs/api/link/
- Plaid transaction webhooks: https://plaid.com/docs/transactions/webhooks/
- Apple FinanceKit: https://developer.apple.com/financekit/
- Apple Core ML: https://developer.apple.com/machine-learning/core-ml/
- Apple Vision text recognition: https://developer.apple.com/documentation/vision/recognizing_text_in_images
- Google ML Kit Text Recognition v2 languages: https://developers.google.cn/ml-kit/vision/text-recognition/v2/languages?hl=en
- Amazon Textract AnalyzeExpense: https://docs.aws.amazon.com/textract/latest/dg/API_AnalyzeExpense.html
- ONNX Runtime Mobile / React Native: https://onnxruntime.ai/docs/get-started/with-javascript/react-native.html
- Cash App payment links: https://cash.app/press/cash-app-launches-payment-links

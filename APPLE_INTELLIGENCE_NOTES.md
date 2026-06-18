# Apple Intelligence Notes

Last reviewed: 2026-06-16

This file tracks planning implications for Expense Split from recent Apple Intelligence, Siri, and on-device AI announcements. It is meant to capture product and architecture context that may change how receipt parsing and app actions are prioritized over time.

## What is officially relevant

Based on Apple's current public developer and product materials, the important changes are:

- Apple now exposes a Foundation Models framework for developers, with access to Apple Foundation Models, multimodal prompts, and tool calling.
- Apple describes Vision framework tools such as OCR and barcode readers as callable by models on-device.
- Apple now positions App Intents as the main way to make app content and actions available to Siri AI, Spotlight semantic indexing, and on-screen awareness.
- Apple highlights Visual Intelligence as a system capability that can search, understand, and take action on camera and screenshot content.
- Apple's consumer-facing Apple Intelligence page explicitly says Visual Intelligence can help users split the bill with friends when they get the check.
- Apple continues to position Apple Intelligence as hybrid: on-device first, with Private Cloud Compute for more complex requests.

## What is not yet verified

As of 2026-06-16, we have not verified a dedicated public Apple receipt-parsing SDK that returns receipt-specific structured fields such as merchant, subtotal, taxes, total, and line items as a turnkey API.

Current evidence points to a composable stack instead:

- Vision OCR / scanning
- multimodal prompting
- app-defined tools and review flows
- Siri / Visual Intelligence integration where relevant

That means Apple may have made receipt intelligence easier to build on iOS, but not fully solved it for us.

## Planning implications for Expense Split

This does not change the core product thesis:

- Expense Split still needs a strong non-app participant flow.
- Public expense/payment links still matter.
- Cross-platform/manual review still matters because the product cannot depend on Apple-only features.

What should change is priority and framing for receipt work:

- Move an iOS-native receipt intelligence spike earlier in planning.
- Treat Apple-native receipt assistance as an accelerator for iOS, not as the canonical product architecture.
- Keep the manual editable review flow as the product center of gravity.
- Preserve a server-assisted or cross-platform fallback for Android, web, unsupported Apple devices, and edge cases.

## Recommended plan update

Instead of treating "receipt parsing" as one monolithic feature, split it into two tracks:

### 1. Cross-platform receipt review flow

This remains the product-critical track.

- Capture or upload a receipt image.
- Extract text and candidate structure.
- Show an editable review flow for merchant, date, totals, and line items.
- Let the user assign items or subtotals to group members.
- Create a final expense only after review and confirmation.

### 2. Apple-native receipt intelligence spike

This becomes a near-term implementation experiment.

- Prototype iOS-native receipt capture and OCR using Apple's current frameworks.
- Evaluate whether Apple Foundation Models plus OCR can draft receipt structure locally with acceptable quality.
- Measure accuracy, latency, and UX quality on realistic grocery, restaurant, and mixed-item receipts.
- Compare the result against the currently planned server-assisted path.

If the spike works well, it can improve privacy, latency, and cost on iOS. If it does not, the cross-platform review flow still stands on its own.

## Architecture implications

The current app is Expo-based. Direct adoption of Apple's newest native AI capabilities may require changes such as:

- Expo prebuild instead of a purely managed workflow
- custom native modules or bridges
- iOS-only feature gating in the UI and product plan

We should not assume these Apple-native capabilities are "free" to adopt inside the current architecture.

## Product strategy adjustment

The revised strategy should be:

1. Keep non-app participant and payment-link work high priority.
2. Keep the manual expense and settlement system-of-record experience strong.
3. Add a focused iOS-native AI spike for receipt intelligence sooner than originally planned.
4. Avoid rewriting the whole automation roadmap around Apple-only capabilities.
5. Keep privacy-first, editable, user-confirmed flows as the default product principle.

## Working conclusion

Apple's latest announcements make iOS-native receipt assistance materially more credible.

They do not remove the need for:

- explicit user review
- cross-platform fallback
- app-owned expense data structures
- non-app participant support
- careful architecture decisions around Expo and native integration

The right response is to raise the priority of an Apple-native receipt intelligence experiment, not to replace the existing product roadmap with an Apple-dependent one.

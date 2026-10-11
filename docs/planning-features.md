# Inventory planning and correction

## Scope

Implement three small features without adding bottom navigation: usage corrections, consumption estimates, and a shopping tab inside inventory. Account operations remain scoped to the authenticated subject; explicit local recording has equivalent behavior. Public browsing contains no sample data. This work does not authorize a WeChat upload, review submission, or publication.

## Usage corrections

Undo a single use or atomically undo an entire checkout batch. Correct quantity, business date, and note by reversing the original deduction and writing a replacement use. Keep the original record, mark it voided, and append inventory restoration evidence. Only active use records can be corrected. Replacement records retain batch membership. All affected balances are checked before committing; deleted items or balance overflow reject the entire operation. Retry IDs prevent duplicate inventory changes. History and daily usage expose correction status, while forecasts ignore voided records. A separate exclusion control omits an unusual business day from prediction without changing inventory.

## Consumption estimate

Use only real active use records from the last 14 calendar days in Asia/Shanghai. Require at least three distinct recorded days and a latest record no older than seven days. Average across calendar days from the first eligible use to today, excluding business days explicitly marked unusual. Missing days in this interval contribute zero, so estimates are approximate and depend on complete recording. Display the method and never fabricate forecasts when evidence is insufficient. Divide current canonical inventory by daily consumption and round up; never combine units or items.

## Shopping list

Add an existing item (including low stock) once or manually enter a future purchase. Store planned quantity/unit and note. Entries may be removed or completed without changing inventory. A linked entry supports a confirmed, atomic purchase-and-restock operation: add a validated canonical quantity, optionally update its purchase price and dates, append a restock record, and mark the entry completed together. Planned quantities never count as stock. A manual, unlinked entry must first be linked to a real saved item to restock; no hidden product creation occurs. History of completed purchases remains available. Operations use retry IDs and optimistic entry revisions.

## Verification

Focused server and client tests cover stock restoration, retries, batch atomicity, ownership, forecasts with sparse/excluded/voided data, shopping completion and restock. Run client typecheck, domain tests, both official Taro builds, server pytest, and Ruff. Report browser, WeChat developer-tool, and real-device checks separately.

## Implementation and acceptance (2026-10-10)

- Persistence adds owner-scoped shopping entries and retry-action receipts without changing existing item units or erasing records. Legacy checkout movements recover their batch membership. Public examples remain deleted.
- UI: correction/undo/exclusion actions appear beside active use records; voided rows show their status. Forecasts appear in item details and inventory rows. Shopping is a switch within the inventory tab, not a new navigation tab. Purchase price/date changes are explicit; different-batch stock should remain separate records.
- Passed: 21 client tests, TypeScript, 13 server tests, Ruff, and official H5/WeChat builds. WeChat build has no CSS-order warning after aligning shared component import order. H5 retains its entrypoint-size warning (303 KiB versus the 244 KiB recommendation).
- Chromium H5 acceptance used test-owned data in an isolated temporary browser profile, never production or public sample records. Passed real UI actions for forecast display, adding shopping, confirmed restock, usage quantity correction, single undo, and batch undo; device-only flows made zero API calls. Screenshot: `/tmp/xiaoman-planning-usage-20261010.png`. The clean public browsing regression also passes separately.
- The local `xiaoman-api.service` was restarted and is active; health returns success and unauthenticated shopping requests return 401. Existing runtime data remains intact. New SQLite tables are created additively at startup.
- Manual WeChat developer-tool UI and real-device checks remain pending. No WeChat upload, audit submission, or publication occurred in this goal.


## WeChat upload

Version `0.1.8` was successfully uploaded on 2026-10-10 using the official `npm run upload:weapp` Taro command after explicit user approval. It includes usage correction and undo, real-data consumption estimates, and shopping-list restock. Log: `/tmp/xiaoman-planning-upload-20261010.log`. Experience QR artifact: `client/dist/weapp/upload.png`. No audit submission or release publication was performed.

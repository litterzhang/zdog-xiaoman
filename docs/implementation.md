# Implementation Plan

## Product

Working name: Xiaoman (Chinese UI: 小满). A private daily inventory for parents, including an expected-baby state and a born-baby state. The slogan is “满满准备，慢慢长大。” The expected-baby greeting is “期待{name}的到来”, followed by “把爱一点点备好，等你慢慢来到。”

## Delivery Method

Document, implement, and run a small set of valuable tests. No formal review stage or dedicated security audit workflow. Normal ownership-scoped application data and real login remain part of functionality, not a separate gate.

## Visual Direction

The UI reference is the read-only `../zdog-mp/zdog-client` homepage at `https://mph5.942295.xyz/#/pages/index/index`. Its 750px design values are adapted to Xiaoman's 375px design width rather than copied literally.

Use `#f8f8f8` page backgrounds, white grouped cards, approximately 6px corners, 10px page/card spacing, ordinary 14px body text and 18px content titles, thin `#eeeeee` dividers, and restrained gray-blue accents. No green, warm palette, shadows, gradients, oversized hero numbers, English eyebrows, repeated page titles, brand topbars, or custom in-page navigation. Keep native WeChat navigation and native tabs outside the page content. Baby greetings, item names, and card section labels are business content, not page headers.

Forms, item rows, login, baby setup, home, and profile use this shared card/list language. Authentication, data ownership, date calculations, and stock movement behavior remain unchanged. The existing generated app mark and tab/category assets are preserved.

## Build and Delivery

Use only the official Taro build/watch/preview/upload commands and `@tarojs/plugin-mini-ci`, configured like Yizhu. No custom staged-output runner, custom uploader, or custom browser-driver command is part of the workflow. Preview/upload are opt-in, require the application's own credentials, and are never executed merely to verify a UI change.

## Categories

| ID | Chinese UI | Examples | Default unit |
| --- | --- | --- | --- |
| formula | 奶粉 | Infant formula, supplemental formula | Can |
| diapers | 纸尿裤 | Disposable diapers, pull-ups | Piece |
| feeding | 喂养 | Bottles, nipples, milk storage bags, feeding utensils | Item |
| cleaning | 清洁 | Wipes, cotton tissues, bottle cleaner | Pack |
| care | 护理 | Bath products, skincare, cotton swabs | Item |
| clothing | 衣物 | Bodysuits, socks, bibs, swaddles | Item |
| travel | 出行 | Stroller accessories, carriers, travel supplies | Item |
| other | 其他 | Household-specific supplies | Item |

These are product-design choices, not medical advice or a sourced clinical taxonomy. Units are editable. Never sum cans, pieces, and packs into a misleading total. Parents choose whether a product's count represents unopened packages or individual pieces; the unit makes this explicit. Create separate entries for different sizes, batches, or expiry dates. For reusable items, reducing stock means removal or retirement, not each daily use. Medicines, dosage guidance, feeding schedules, and automatic opened-product shelf life are not included.

## Architecture

Separate `client/` and `server/` packages, matching the reference repository. Domain types and pure calendar/reminder functions are separated from Taro storage, API transport, and pages. Flask uses an application factory, blueprint routes, a zdog-auth adapter, and SQLite persistence. One baby profile per account in this first version.

Business dates use the Asia/Shanghai calendar. Pre-birth days are calendar days until the due date, not a clinical prediction. A past due date stays in the expected state until the parent explicitly changes it. The birthday counts as day one.

Stock movements are immutable records with retry IDs. A retry cannot consume twice. Product metadata edits preserve stock; movements alone change the count after creation. Revision checks prevent stale metadata forms from overwriting newer changes. Item deletion also deletes its history.

## MVP Scope

- Login or explicitly labeled, device-only demo.
- Baby nickname, expected/born state, due/birth date, and editable profile.
- Category/search/reminder filters, item creation/editing/deletion.
- Custom unit, initial quantity, low-stock threshold, expiry date, opened date, notes.
- Restock/use records, balance, timestamps, and manual refresh.
- In-app expiry reminders (30 calendar days) and low-stock reminders.

No silent demo fallback, sample stock presented as real data, subscription notifications, account sharing, multiple babies, registration, or billing. Deployment and code upload are performed only with explicit approval; the existing H5/API deployment is documented separately. Real WeChat login depends on a separately provisioned zdog-auth client and an approved HTTPS request domain. Platform privacy configuration must be completed before publication; the in-app development notice is not a final legal policy.

## Minimal Verification

A small server test suite covers the working profile/inventory flow, movement retries and insufficient balance, and metadata edits. Client tests cover calendar boundaries, reminders, categories, and validation. Type-check and build both H5 and WeChat. Run the API and built H5, then check the demo flow and mobile rendering in a browser using the available browser tools. No custom build/upload/browser-driver scripts are part of the workflow. WeChat developer-tool and real-device tests remain separate, manual platform steps.

## Custom Dialogs

Privacy information, sign-out, and item deletion use the shared page-local dialog component instead of native modal styling. Dialogs add a translucent cool-gray backdrop, a white 22px rounded surface, a small geometric badge, muted copy, gray-blue actions, and a short entrance transition. This is a deliberate accent to the otherwise flat page design; no page header or navigation is added. Long copy scrolls, and reduced-motion preferences disable animation on H5.

Destructive actions require explicit confirmation. Backdrop dismissal, page hiding, unmounting, and replacement cancel a pending decision. The controller settles each request once. Two focused tests cover confirmation and cancellation; WeChat developer-tool and real-device appearance remain manual checks.

## Category Forms and Quantities

Category schemas live in `client/src/config/itemForms.ts`; Python validates matching metadata keys in `item_details.py`. All metadata is optional so pre-existing JSON records remain valid without a destructive migration.

| Category | Specific fields | Date fields |
| --- | --- | --- |
| Formula | Brand/series, stage, net grams per can | Expiry, opened date |
| Diapers | Brand/series, size, pieces per pack | Expiry |
| Feeding | Brand/series, capacity, material | None |
| Cleaning | Brand/series, pieces per pack | Expiry, opened date |
| Care | Brand/series, volume | Expiry, opened date |
| Clothing | Size | None |
| Travel | Brand/series, model | None |
| Other | Custom unit and notes | Expiry, opened date |

New formula records store integer grams. A configured can weight enables can input with up to three decimal places, provided the result is a whole gram: 0.5 cans at 800g is 400g. Diapers store integer pieces; configuring pieces per pack enables whole-pack input. Never infer package size. Switching input units clears the unfinished amount instead of reinterpreting it. Old can/package-based records retain their original balances and histories. Existing stock units and categories cannot be changed; create a separate record for a different specification or unit.

Optional purchase price uses integer cents, with a separate price unit such as can, pack, or item. It is a reference purchase unit price, not a per-gram/per-piece charge or an expense ledger.

## Dated Usage and Daily Checkout

The item detail action records usage quantity, actual usage date, and an optional note. Applying a past date deducts current inventory; this is not a reconstructed historical stock ledger. Recording time remains separate from usage date. Legacy movements fall back to their recorded date in Asia/Shanghai.

The daily usage page allows selecting the date, adding items one by one, checking/removing pending entries, and submitting one batch. Repeated selections of an item merge quantities. Adding to a draft does not deduct stock. Confirmation submits 1–50 distinct item entries. SQLite validates every balance in one transaction before writing any deductions; insufficient balance fails the whole batch. A persistent batch UUID and fingerprint make retries idempotent. Demo checkout performs the same complete validation before a single local-storage write and never touches live records.

An archive is a view of zero-stock items, not a deletion. Zero-stock items disappear from active lists and home reminders, retain their metadata and usage history, and reappear automatically after restocking. New zero-stock records also belong in the archive. Daily usage includes archived items. Explicit deletion still removes item history as stated by the existing confirmation dialog.


## Verification and Delivery — October 5, 2026

Eight client tests and six server tests passed, along with TypeScript and Ruff. Official Taro H5 and WeChat builds succeeded. An isolated, explicitly labeled H5 demo browser flow passed formula half-can conversion, diaper pack conversion, category metadata, prices, manual barcode reuse, pending batch assembly without early deductions, custom confirmation, committed daily usage, zero-stock archive, restock restoration, and backdated single usage. Width checks passed at 390px and 320px; no browser exceptions were observed. Temporary browser checks are not project build/upload scripts.

The API service was restarted and its health endpoint checked; the rebuilt static H5 was updated. The official `npm run upload:weapp` command uploaded version 0.1.1 successfully. Version and description were passed as CI environment settings, without introducing an uploader script. The generated experience QR image is `client/dist/weapp/upload.png`. No review submission or publication was performed. Camera scanning, WeChat developer-tool checks, actual authenticated user flows, and real-device checks remain separate and unverified.

### Compact Item Actions

The item summary's restock and usage actions are content-width controls with a 36px minimum visual height, 12px text, and an 8px gap. They no longer expand to fill half the card. This page-scoped override does not shrink save/submit actions or change the custom dialog style.

The compact-action update passed the existing eight client and six server tests, TypeScript, Ruff, and both official Taro builds. An isolated H5 demo check measured the actions at 36px tall and approximately 72px/76px wide at both 390px and 320px viewports; restock/use interactions passed without overflow or browser exceptions. Static H5 is updated. This subsequent styling change has not been uploaded to WeChat; developer-tool and device checks remain unperformed.


## Open Catalogs and Icon Replacement — October 5, 2026

The three public catalogs are now connected through a Flask adapter with bounded parallel lookups, caching, provider statuses, manual fallback, and source provenance. The form fills only user-confirmed, empty compatible metadata; stock, purchase prices and business dates remain private/manual. See `barcode-recording.md` for the exact contract and verification. This update passed nine client tests, eight server tests, TypeScript, Ruff, both builds and a live H5 demo lookup/import flow. H5/API are updated; a new WeChat upload was not performed.

A more refined replacement icon was requested using the previously specified XDOG image CLI and HTTP proxy. The actual generation request returned HTTP 429 and produced no image. The version-2 prompt and generation status are preserved under `client/design/generated/app-icon-v2/`. Existing version-1 artwork remains unchanged; no substitute image or unapproved provider/model was used. Icon replacement is incomplete pending provider availability and an authorized retry.


### Authorized Upload — October 5, 2026

The user explicitly requested immediate code upload and a prompt handoff for generating the new icon elsewhere. Official `npm run upload:weapp` successfully uploaded version 0.1.2 with compact item actions and the three open-catalog integrations. No review submission or publication occurred. The generated experience QR is `client/dist/weapp/upload.png`. The original icon remains unchanged; the complete replacement prompt is `client/design/generated/app-icon-v2/prompt.txt`. This upload supersedes the earlier not-yet-uploaded delivery notes above.


## Cache/Autofill Delivery — October 5, 2026

The user's requested cache-first chain is implemented in `catalog_cache.py`, `catalog_sources.py`, and `catalog.py`. Normalized successful product records, in-flight leases, request reservations and provider cooldowns persist in a separate SQLite file. The app reuses owner-local specifications first; the server checks cached GTIN records, then ordinary ApiZero lookup, eligible domestic GS1 lookup, and the existing open catalogs. GDS BFF is deliberately excluded at the user's latest instruction. No browser UA impersonation or GDS authentication workaround was added.

Lookup now automatically fills compatible empty metadata without a confirmation popup. Existing manual values are preserved, inventory is not created by lookup, and prices/business dates are not imported. A source/cache note remains visible. The previously verified Pampers record was saved in the real product library, not inserted as fake demo stock.

Ten client tests and nine server tests passed, together with TypeScript, Ruff and both official Taro builds. An isolated H5 browser check used the real product cache and verified automatic name/brand/NB/20-piece metadata, no confirmation popup, preserved price/expiry, owner-local reuse, and 320px layout. A server restart and both EAN-13/GTIN-14 reads returned the persistent record without consuming a supplier request. Original onboarding/expected/born/stock/daily-use/archive flows were also checked in a separate isolated local H5 acceptance flow. Live access logs show successful H5/WeChat login and protected application requests, without inspecting private payloads or exposing session tokens.

Official `npm run upload:weapp` uploaded version 0.1.3 successfully at 23:28 on October 5, 2026, following the explicit upload request. H5 and API are updated. No review submission, publication, account purchase or recharge occurred. The original icon is unchanged; its replacement is awaiting the user's externally generated bitmap. Camera scanning and manual developer-tool/real-device UI checks remain unperformed by the assistant.


## Full Barcode Product Names — October 6, 2026

The public cache already contained the full registered name for `6903148349557`, including the Black Gold range, NB size and 20-piece pack. The client previously preserved every nonempty name and stopped after reusing an own record; this could leave a brand-only placeholder in place despite richer cached metadata.

Brand-only, brand-plus-category and category-only placeholders now upgrade to a specific barcode product name. A genuinely customized or already complete name is preserved. Incomplete own specifications continue to the server catalog rather than blocking enrichment. The form shows the identified barcode product separately from the editable name and brand fields. Querying alone does not rename saved items; an existing record changes only after Save, without altering stock, price or dates.

Supplier brand-only results are treated as incomplete identities rather than complete SKU hits. They can fill compatible metadata, but cannot invent a name or downgrade a full one. Lookup continues to the next source. Legacy brand-only permanent cache records are eligible for enrichment; new partial records receive a short cache period with explicit incomplete-name messaging instead of becoming permanent full-name records.

Eleven client tests and nine server tests passed with TypeScript and Ruff. Official H5/WeChat builds passed. An isolated real-cache H5 regression covered a prefilled brand name, an old brand-only own record, a customized name, and editing/saving an existing item with stock/price/expiry unchanged. No live inventory was modified by the checks. Both UI name and barcode-result text include the full Black Gold product name. Manual developer-tool/camera/device UI checks remain unperformed.

Official Taro uploaded version 0.1.4 successfully at 12:30 on October 6, 2026. H5 and API are updated. No review submission or publication occurred.

## Session recovery (2026-10-09)

Previously, both inventory and barcode requests discarded the stored session on the first HTTP 401. The client retained only an access token; it had no recovery path. The exact upstream token lifetime has not been verified, and no lifetime setting was changed.

New logins resolve `/auth/me` and store its trusted identity alongside the access token. In WeChat builds, a rejected authenticated request obtains a fresh `Taro.login` code and exchanges it through the existing machine-login adapter. Before storing the new token or replaying the request, the client checks that the server-resolved identity is unchanged. Concurrent and late rejected requests share one recovery. Each request retries at most once, preserving its original data and operation ID. Network errors and upstream 5xx responses retain the session; account switches and logout during recovery prevent replay.

Existing sessions without a recorded identity require one explicit login after expiry. H5 still requires explicit login after expiry because the configured machine API adapter has no established refresh-token contract. Passwords are not persisted, no refresh endpoint is guessed, and expired credentials never bypass server validation. A recovered credential rejected again with 401 is discarded.

Verification: focused domain tests cover parallel recovery, outages, identity changes, logout races, legacy sessions, H5 behavior, and repeated rejection. WeChat developer-tool and real-device expiry checks must be reported separately from automated tests.

Upload: version `0.1.5` was successfully uploaded using the official `npm run upload:weapp` command on 2026-10-09 at 09:12 CST. Upload log: `/tmp/xiaoman-auth-upload-20261009.log`. Experience QR artifact: `client/dist/weapp/upload.png`. This action did not submit an audit or publish a release; the WeChat console may still require selecting this developer version as the experience version. Browser, developer-tool, and real-device session-expiry checks remain pending.

## Voluntary login and public browsing (2026-10-10)

The rejected review reported that launch required authorization before visitors could browse the service. The launch page is now the public home tab rather than the login page. Home, inventory, and account tabs render without a session and do not call authentication or private APIs. Public inventory examples are explicitly fictional, read-only, and stored separately from account and local records. Visitors can filter all eight categories and read inventory, reminder, and daily-usage explanations before making any choice.

Visitors may explicitly start local recording without authentication, then use the existing baby profile, item forms, restock, usage, batch checkout, and archive flows. Local data remains device-only and is not silently merged into a real account. Optional login is offered from the account tab. The login page allows returning to browsing without consent or authentication, and local-mode users may reach optional login without being redirected away. Logout returns to public home instead of forcing another login.

The client does not call `getPhoneNumber`, `getUserProfile`, `getUserInfo`, or avatar/nickname authorization APIs. WeChat code login remains user-initiated, apart from recovery of an already-authorized live session. No authentication checks were removed from server-owned inventory routes. An API outage does not create a local demo session or disclose account data to visitors.

Review reproduction: clear app storage, launch the home tab, browse category examples, visit both other tabs, optionally choose local recording and create an item without logging in. Login is a separate voluntary action on the account tab. Re-upload does not itself submit a review or publish a release.

Verification: 17 client tests, TypeScript, 9 server tests, Ruff, and both official Taro builds passed. The generated WeChat manifest starts at `pages/home/index`. A clean-profile Chromium H5 check passed public launch, category filtering, all three public tabs, voluntary login navigation, dismissing login, and starting local onboarding without login; these flows made zero API requests. Screenshot: `/tmp/xiaoman-guest-home-20261010.png`. Manual WeChat developer-tool and real-device checks remain unperformed; these results do not guarantee review approval.

Upload: version `0.1.6` was successfully uploaded using the official Taro command `npm run upload:weapp` on 2026-10-10 at 10:05 CST. Log: `/tmp/xiaoman-guest-upload-20261010.log`. Experience QR artifact: `client/dist/weapp/upload.png`. No audit submission or release publication was performed. The operator/contact details and final privacy-policy content must still be supplied accurately by the owner before launch.

## Remove public sample data (2026-10-10)

Superseding the public-example design above, unauthenticated browsing now contains only category controls, empty inventory states, and general feature descriptions. Deleted the fictional preview dataset and removed fabricated quantities and daily-use examples from the public UI. No sample records are seeded. Explicit device-only recording remains available and continues to show only records entered by the user, separately from account data. Existing user-entered local records are not erased.

Verification for sample removal: 17 client tests, TypeScript, 9 server tests, Ruff, H5 build, and WeChat build passed. A clean-profile Chromium check confirmed public empty states and category selection without fabricated quantities, all public tabs, optional login, returning to browsing, and local onboarding without login, with zero API requests. Screenshot: `/tmp/xiaoman-no-samples-home-20261010.png`. Manual WeChat developer-tool and real-device checks remain pending. No new WeChat upload was performed for this follow-up.


Upload: version `0.1.7` was successfully uploaded using the official Taro command `npm run upload:weapp` on 2026-10-10. This version removes all fictional public inventory and usage examples while preserving public browsing and explicit device-only recording. Log: `/tmp/xiaoman-no-samples-upload-20261010.log`. Experience QR artifact: `client/dist/weapp/upload.png`. No audit submission or release publication was performed.

## Repository directory rename (2026-10-11)

Renamed the workspace directory from `~/workspace/zdog-baby` to `~/workspace/zdog-xiaoman`. Updated Taro project labels, repository-path references, upload-key paths where applicable, and the installed Nginx/API service configuration. Domains, WeChat AppID, internal Python package names, database locations relative to the repository, and account data remain unchanged. Recreated the project's own virtual environment at its new path to avoid broken absolute shebangs and editable installs; the old environment is retained temporarily at `/tmp/xiaoman-venv-before-rename-kP3was/venv`. The static H5 SELinux file-context rule now covers the new directory.

Verification: 21 client tests, TypeScript, 13 server tests, Ruff, both official Taro builds, and clean-profile H5 browsing checks passed at the new path. API and Nginx are active; direct health and both local HTTPS virtual hosts respond successfully. The old static-root SELinux rule was removed after the new rule was applied. Dependencies were restored from the retained project environment and revalidated with `uv sync --locked --offline`; no reference-project environment was used. No WeChat upload was performed. WeChat developer-tool and real-device checks remain pending.

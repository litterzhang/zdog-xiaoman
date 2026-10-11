# Barcode-Assisted Item Recording

## Current Implementation

The WeChat form uses the official `Taro.scanCode` API with `scanType: ['barCode']` and `onlyFromCamera: true`. H5 offers manual barcode input instead of claiming camera support. Barcode values remain strings so leading zeroes survive. Scan cancellation does not produce an error; other failures show a manual-entry fallback. Scanning never creates stock or deducts anything by itself.

After scanning, the form first looks for the same code among the authenticated parent's existing items (or explicitly separate local demo data). A custom confirmation can reuse the name, category, and package specifications. It does not reuse quantity, price, expiry, or opened date. If no local specification matches, Flask queries Open Food Facts, Open Products Facts, and Open Beauty Facts. Manual lookup is also available in H5. Suggestions require explicit confirmation; missing records and unavailable sources retain manual input. Duplicate codes are allowed across separate batch/expiry records; the most recently listed matching record provides the suggested specifications.

## Investigation and Scope

The official Taro API documentation was retrieved on October 5, 2026 and confirms the barcode-only option and returned scan content. Source: `https://docs.taro.zone/docs/apis/device/scan/scanCode`.

Camera decoding supplies an identifier, not this application's trusted product metadata or the parent's purchase price. A first-time automatic product lookup would require a separately integrated catalog with known coverage, response schema, provenance, terms, and credentials where applicable. No paid product service has been purchased or provisioned. The subsequently enabled integrations use the three public open-data APIs only. The GS1 Verified-by-GS1 overview was investigated as a possible catalog direction, but its page returned HTTP 403 from this environment; availability, API terms, and Chinese infant-product coverage are not verified. Source investigated: `https://www.gs1.org/services/verified-by-gs1`.

Lookup runs on the Flask server, keeps transport settings out of client code, caches bounded public catalog metadata, and presents returned specifications as suggestions for confirmation. It must preserve manual input on no match/error and must never invent package size, price, batch, expiry, or opened date. The owner-local matching flow remains the first choice, followed by the three public open-data adapters described below.

## Verification Boundary

H5 manual entry and owner-local reuse can be checked in a browser. Actual camera scanning and permissions require WeChat developer-tool/device verification. Successful builds or upload do not establish camera/device correctness.

## Open-Data Catalog Candidates — October 5, 2026

The following primary documentation was inspected before implementing the three read-only adapters.

- Open Food Facts: open food-product data and barcode lookup, a candidate for formula and other packaged foods. The official API documentation explicitly says community data is not guaranteed accurate or complete. Mainland-Chinese formula coverage has not been measured.
- Open Products Facts: a candidate for non-food supplies such as diapers and bottles. Official documentation labels its APIs experimental; it shares the Product Opener codebase but its metadata and behaviour are not identical to food records. Do not promise coverage of a particular brand or diaper size without checking actual barcodes.
- Open Beauty Facts: a candidate for cosmetic/skincare products, not a general database for all baby-care items.
- The official cross-project barcode API accepts `product_type=all` and may redirect to another project. A future Flask adapter must validate allowed destination hosts, apply timeouts and caching, and surface found metadata only as user-confirmable suggestions. No personal inventory, usage history, baby profile, or purchase price should be submitted to a public catalog.
- Product Opener's published food-data licensing distinguishes ODbL for the database, the Database Contents License for individual contents, and CC BY-SA for product images. Attribution and reuse terms must be accounted for before redistribution; keep public catalog data/provenance separate from private inventory. This note does not determine the legal status of any future combined database.

Recommended sequence: validate a small representative set of the parent's actual formula/diaper barcodes first, then integrate read-only lookup with provenance, manual fallback, and no automatic price/expiry/opened-date inference. The current barcode matching feature prefers owner-local data and now supports confirmed external lookup as described below.

Primary documentation:

- `https://openfoodfacts.github.io/openfoodfacts-server/api/`
- `https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/scanning-cosmetics-pet-food-and-other-products/`
- `https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/`


## Enabled Three-Source Integration

`GET /api/catalog/products/<barcode>` is a public, read-only metadata endpoint and does not read private application data. Both live and explicitly labeled demo forms may use it. The server validates an 8/12/13/14-digit numeric product identifier, preserving leading zeroes, and queries the three fixed HTTPS origins in parallel using `/api/v3/product/<barcode>`. It requests only code, product names, brands, package quantity, and category tags. No baby profile, owner identifier, authentication header, inventory, price, or usage history is sent upstream. Redirects are rejected rather than followed to arbitrary hosts. A custom public-app User-Agent is supplied.

The adapter returns per-provider found/not-found/unavailable statuses. A partial outage is displayed; complete outage returns 503, not a fabricated no-match result. Rate limiting is explicit. A shared process-local budget permits at most 12 upstream requests per minute (four three-source lookups). Public results cache for 24 hours, complete misses for 10 minutes, and partial outages for 1 minute, with at most 256 entries. Catalog settings optionally use the existing HTTP proxy via `BABY_CATALOG_HTTP_PROXY`; this does not change authentication transport.

Only explicit recognized category tags suggest formula/diapers/feeding; beauty suggests care. Unknown foods do not become formula automatically. A single unambiguous package weight/count can suggest can grams or pieces per pack, but multipack quantities are not treated as per-container amounts. Stage, diaper size, opened date, expiry, and purchase price are never inferred. Confirming a suggestion fills only empty compatible fields and retains provider/barcode/fetch-time provenance. A confirmed category change on a new record resets unfinished quantities rather than reinterpreting their units; existing record category/unit are never changed. If a barcode changes, stale provenance is cleared.

`catalogSource` persists a source reference with the private item. The UI displays the provider and offers a copy-source-link action, built only from the fixed provider origins. Product images are not requested, embedded, or hotlinked. No bulk catalog redistribution or public mixed inventory/catalog database is implemented.


## Verification — October 5, 2026

Nine client tests and eight server tests passed, as did TypeScript, Ruff, and official Taro H5/WeChat builds. Tests cover three-source normalization, provenance, caching, provider failure/miss distinction, request budgets, and confirmation that imported data cannot overwrite private stock/price/dates.

Live checks reached all three catalog origins. The official sample food barcode returned Open Food Facts metadata; a sample beauty barcode returned Open Beauty Facts metadata. The investigated Open Products Facts example returned no record from any source, so no claim is made about that sample or Chinese diaper coverage. Provider misses are normal manual-entry cases, not fabricated catalog matches.

An isolated H5 demo browser flow used the real public API, displayed a suggestion and source, required explicit confirmation, preserved quantity and price, saved provenance, and retained manual input for an unsupported barcode. The 320px layout passed without browser exceptions. The static H5 and API service are updated. Actual camera scanning, WeChat developer-tool testing, authenticated private workflows, and real-device testing remain unverified. These source changes were uploaded to WeChat as version 0.1.2 through the official Taro CLI on October 5, 2026, after explicit user approval. No review submission or publication was performed.

## Persistent Cache and Automatic Fill — October 5, 2026

This section supersedes the previous three-source-only, in-memory and confirmation-only behaviour.

### Query Order

1. The parent's existing item specification is reused locally when its barcode matches, including archived items.
2. Flask reads its SQLite public product library before contacting any supplier. GTIN-13 and zero-padded GTIN-14 share one cache key; leading zeroes are preserved in the UI/provenance.
3. ApiZero ordinary text lookup: `/api/barcode-lookup`, parameter `barcode`.
4. ApiZero GS1 registered-product lookup: `/api/barcode-gs1`, parameter `code`. The supplier documents domestic-registration coverage only; known non-69 GTINs skip this step instead of wasting that allowance.
5. Open Food Facts, Open Products Facts, and Open Beauty Facts remain ordered fallback sources.

Stop at the first usable supplier result. No GDS BFF interface is called: the user explicitly deferred those interfaces after access-limit responses and identifying their authentication requirement. No UA spoofing, authentication bypass, cookie reuse, or paid-service provisioning is part of this change.

### Durable Records and Limits

`BABY_CATALOG_DATABASE` optionally selects a cache file; otherwise `catalog.sqlite3` is stored beside the inventory database. Positive normalized product metadata persists across service restart with original provider/fetch time and no automatic expiry. Only complete, confirmed supplier misses receive a short five-minute negative cache. Timeouts, restricted access, quota exhaustion, mismatched identifiers, incomplete records, and other failures never become cached missing products.

Cross-process SQLite leases suppress duplicate in-flight supplier lookups for the same canonical GTIN. Request reservations and provider cooldowns also persist across restart; a timed-out request still counts toward the local request budget. GS1 is capped at five authenticated requests or two anonymous requests per rolling 24 hours; `BABY_GS1_DAILY_LIMIT` can lower the cap or disable GS1. Ordinary lookup is capped at 200 authenticated or 20 anonymous calls per rolling 24 hours. These are application-wide ceilings, not additional vendor credits; portal/other-client activity can consume the provider's remaining allowance, and provider quota errors stop calls. No plan is purchased or upgraded. Open-catalog fallback shares a 12-request/minute budget. Supplier credentials are never forwarded to another origin or stored in product records.

Public metadata cache hits are usable without a supplier key. Only trusted app sessions, authenticated by zdog-auth, may invoke the configured server ApiZero key on cache misses. Demo/guest requests use anonymous supplier access. Keys stay in ignored `server/.env` as `APIZERO_API_KEY`, never in client variables or bundles.

### Automatic Form Behaviour

Lookup no longer requires a separate confirmation dialog. A result automatically fills an empty name and compatible empty category-specific fields, with a visible source/cache note. Existing manually entered values are preserved. An explicit package count or weight may supply packaging metadata; diaper size is suggested only from an explicit size token in the returned name. Formula stage/age suitability are not inferred. Price, stock, expiry, opened date, listing date and registration-validity dates are never copied into inventory business fields. A new-category change resets unfinished quantities instead of treating grams as pieces; an existing record keeps its stock category/unit immutable. The user can edit supplied metadata before pressing Save; querying alone creates no inventory record.

The previously verified public GS1 result for `6903148349557` was imported into the persistent library without a new vendor call. It identifies the Pampers NB 20-piece product; its registration dates and raw administrative IDs are not imported. This is a real prior supplier result, not demo/sample metadata fabricated to satisfy lookup.


### Cache/Autofill Verification

The update passed ten client tests, nine server tests, TypeScript, Ruff, H5 build and WeChat build. Real server-cache reads after service restart returned both `6903148349557` and `06903148349557` from one GTIN record; the supplier-request counter did not change. An isolated browser test verified automatic compatible metadata fill with no modal, manual price/expiry preservation, no inventory writes caused by lookup, existing own-record reuse, and narrow-screen layout without exceptions. Official Taro uploaded this update as version 0.1.3. No real-device camera test or manual developer-tool visual test was performed.


### Product-name Quality Fix — October 6, 2026

Nonempty names are not all protected custom names: brand-only and category-only placeholders may be upgraded to a full barcode SKU name. Incomplete local specifications no longer short-circuit fuller cached metadata. Source responses consisting only of brand/category text are explicitly partial, so ordinary lookup can fall through to GS1 without caching that text as a complete identity. Genuine custom names are retained, and the barcode-identified product is visible separately. Existing saved rows are not bulk-renamed; Save is required. This regression-tested fix shipped in version 0.1.4.

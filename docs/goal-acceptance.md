# App Creation and Runtime Acceptance

Date: October 5, 2026. This records the original app-creation objective, not a publication/review gate or a general security audit.

## Requirement Evidence

| Original requirement | Inspected implementation and evidence | Result |
| --- | --- | --- |
| Python + uv + pyproject + Flask server | `server/pyproject.toml`, `uv.lock`, factory in `baby_server/app.py`, application CLI and the project's own `.venv` | Proven |
| Taro + React + TypeScript + SCSS client | Client manifest, seven compiled WeChat pages, domain types, shared components and SCSS tokens | Proven |
| Yizhu architectural pattern, read-only reference | Separate client/server/docs, centralized config/domain/transport/presentation, app factory, auth adapter and owner-scoped SQLite; reference project not modified | Proven |
| White, minimal cool-neutral UI, no custom in-page header/navigation | Shared tokens/styles, native tabs, compact item actions; inspected mobile screenshots and narrow-screen checks | Proven |
| Login and trusted account identity | Real production logs contain successful H5 password and WeChat login, subsequent authenticated snapshots and writes; server derives owner from auth `sub`, not a client owner ID | Proven for observed API flow; not a claim of a complete manual device UI test |
| Birth/due-date onboarding | Local isolated browser starts at login, explicitly enters demo, routes to first profile, saves expected due date, rejects future birth date, saves a valid born state | Proven |
| Pre-birth greeting and slogan | Browser rendered personalized awaiting greeting and later born-day-one greeting; centralized brand strings and calendar tests | Proven |
| Considered item categories | Eight category definitions, category-specific schemas/forms, editable initial units where appropriate, package conversions without combining incompatible counts | Proven |
| Inventory/date management | API tests and isolated browser verify creation, metadata edit, stock-preserving edits, expiry reminders, single dated use, batch use, retry safety, archive, restock and confirmed deletion | Proven |
| English documentation and Chinese product UI | README, implementation/platform/deployment/barcode notes, English code comments, Chinese forms/copy | Proven |
| Small high-value tests | 10 client tests, 9 server tests, TypeScript and Ruff pass; focused on functional flows rather than a formal review/audit pipeline | Proven |
| Both official builds | Successful official Taro H5 and WeChat builds; source and built developer-tool manifests match configured public AppID | Proven |
| Run locally | API service active on loopback 8083; healthy Flask API; local Nginx serves static H5; isolated browser flow ran against the local H5 hostname | Proven |
| No publication, review or extra security workflow | Uploads performed only after explicit requests, most recently 0.1.3; no review submission or publication, no extra audit gate | Proven for actions performed |

## Verification Boundaries

- Browser acceptance uses explicitly labeled, isolated local demo records. It did not alter the user's live inventory or private profile.
- Production log evidence is limited to status/method/route/time and presence of a WeChat user agent. No passwords, tokens, owner IDs, baby details or purchase records were printed. It proves those real API operations were observed, not a complete real-device UI examination.
- WeChat builds and observed WeChat API requests are distinct from manual developer-tool and real-device UI/camera checks. Those manual checks have not been performed by the assistant.
- The server product library caches only normalized public supplier metadata. It is separate from private inventory. Cache hits and restart tests consumed no supplier calls.

## Explicitly Deferred Follow-ups

These are not claimed as achieved by the original app-creation objective:

- The replacement bitmap icon: generation was rate/quota-limited; the user requested a prompt handoff and will generate the image elsewhere. The prompt is delivered; no new bitmap has been supplied or substituted.
- GDS BFF direct integration: the user explicitly deferred it after identifying authentication/access limits. The application does not call those endpoints.
- Complete Chinese-product coverage: unavailable/missing records retain manual entry. GS1 supports its documented registration scope and free quota, not all imported goods.
- Paid API plans, service purchases, recharge, review submission and public release: none were performed or silently enabled.

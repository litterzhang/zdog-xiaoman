# Xiaoman / Baby Supplies Companion

Repository directory: `~/workspace/zdog-xiaoman`.

A minimal WeChat mini-program for keeping baby supplies, quantities, and dates in order. Chinese product UI; English code and documentation. Working brand: 小满. Visual direction: light-gray backgrounds, white grouped cards, compact cool-neutral typography, fine dividers, and no in-page header/navigation bars, green, or warm colors. Pages remain flat; custom dialogs use a restrained floating shadow.

## Stack

- Client: Taro 4.2.1, React 18, TypeScript, SCSS; native WeChat tabs plus H5 preview.
- Server: Python 3.13+, uv, pyproject.toml, Flask application factory, SQLite, Waitress.
- Authentication: dedicated zdog-auth machine client, following the Yizhu reference architecture.

## Quick Start

Requirements: Node.js 22–24, npm, Python 3.13+, and uv.

```sh
cd server
uv sync --locked
cp .env.example .env
uv run baby-server
```

In a second terminal:

```sh
cd client
npm ci
npm run dev:h5
```

Local-only development can use `http://127.0.0.1:10087`: leave `TARO_APP_API_BASE_URL` empty to use its `/api` proxy to `127.0.0.1:8083`. With the configured public API origin, H5 requests go to that origin instead. Choose the explicitly labeled local demo to try the full product before login is configured. Demo records persist only on the current device and are never uploaded or migrated to a real account. A new demo starts with no sample inventory.

The API's health endpoint is `http://127.0.0.1:8083/api/health`. The server never accepts demo credentials. Real H5 login requires an existing zdog-auth account; real WeChat login uses a temporary Taro login code via the server.

## WeChat Development

```sh
cd client
npm run build:weapp
# Or watch source changes:
npm run dev:weapp
```

Import `client/` in WeChat Developer Tools. `client/project.config.json` points to `dist/weapp`; its AppID is aligned with this project's configured `TARO_APP_ID`; keep them consistent for authenticated device testing. Set `TARO_APP_API_BASE_URL` in `client/.env.local` to the HTTPS API origin and rebuild. Approve that origin in the mini-program request-domain settings. Never put the auth client secret in frontend environment files.

### Official Taro Preview and Upload

```sh
cd client
npm run preview:weapp  # taro build --type weapp --preview
npm run upload:weapp   # taro build --type weapp --upload
```

These use the official `@tarojs/plugin-mini-ci` plugin, configured like Yizhu. Set `TARO_APP_ID` and `MINIPROGRAM_PRIVATE_KEY_PATH` in `client/.env.local`; the key path must be outside `src/` and `dist/`. `MINIPROGRAM_VERSION` and `MINIPROGRAM_DESCRIPTION` are optional. Do not confuse the WeChat code-upload key with the zdog-auth client secret or AppSecret. No hand-written `upload.js`, staged build runner, or external SDK uploader is used.

The eight default categories are formula, diapers, feeding (including bottles), cleaning, care, clothing, travel, and other. Forms are category-specific: formula has stage and can weight; diapers have size and pieces per pack; other categories expose relevant specifications. New formula stock uses grams with optional fractional-can input; diapers use pieces with optional whole-pack input. Existing stock units and categories are immutable to preserve history. Optional purchase price has a separate price unit. Barcode scanning first reuses the parent's existing specifications and a persistent, GTIN-normalized server product cache. Cache misses query ApiZero ordinary lookup, then its GS1 registration lookup, stopping at the first usable result. The three Product Opener catalogs remain fallback sources. H5 supports manual barcode lookup. Found metadata automatically fills compatible empty fields; stock, prices and dates stay manual. No-match/outage retains entered data and provider attribution. Supplier keys remain on the server and are used only for authenticated app sessions. The two GDS BFF interfaces are excluded at the user's request. See `docs/barcode-recording.md`.

Record use on an actual date, or open the daily usage page to add items one by one and submit a single atomic batch. Zero-stock items move to the archive view without deletion; restocking restores them. Record separate items for different batches, sizes, or expiry dates.

Usage records support quantity/date corrections, single-record undo, and atomic batch undo while keeping correction evidence. The inventory list estimates remaining days from the last 14 days of real usage, requiring three recorded days; unusual days can be excluded without changing inventory. The inventory page also has a shopping switch: add linked or future purchases, adjust planned quantities, and confirm actual purchases with an atomic restock. Planned purchases never change inventory automatically. Public launch and all three tabs are browsable without authentication or sample data. See `docs/planning-features.md` for calculation rules and correction behavior.

## Nginx / Static H5 Deployment

Follow the same ingress pattern as Yizhu:

| Purpose | Public URL | Local Nginx server name |
| --- | --- | --- |
| Static H5 | `https://xiaomanh5-h.942295.xyz` | `xiaomanh5.942295.xyz` |
| API | `https://xiaoman-h.942295.xyz/api/` | `xiaoman.942295.xyz` |

`nginx.conf.d/xiaoman.conf` serves `client/dist/h5` directly and proxies only the API domain to `127.0.0.1:8083`. The public ingress removes `-h` before forwarding to local HTTPS. Production does **not** need a Taro H5 listener or port `10087`. Build H5 with `npm --prefix client run build:h5`, and run the Python API separately from `server/`.

The client API origin is `https://xiaoman-h.942295.xyz` (without `/api`). Flask allows the public H5 origin and the internal API host. Shared certificate paths follow the reference site under `/etc/nginx/ssl/942295/`. See `docs/nginx-deployment.md` for the exact settings and operator commands. The site was installed and Nginx reloaded on this machine with explicit user approval on October 5, 2026. The API runs as the enabled `xiaoman-api.service`; production H5 remains static. Future deployment changes still require explicit approval.

## Verification

```sh
cd server
uv run pytest
uv run ruff check src tests
cd ../client
npm run typecheck
npm test
npm run build:h5
npm run build:weapp
```

Build, watch, preview, and upload use the official Taro CLI, matching Yizhu. There is no custom build/upload runner or browser-driver command. Preview and upload require the app's own AppID and upload key; they are not executed without an explicit request.

Tests deliberately focus on a few important flows rather than a large test matrix. No formal review or dedicated security audit gate is configured.

## Structure

```text
client/
  config/          Taro build configuration
  src/pages/       Login, onboarding, home, items, item, me, daily usage
  src/components/  Shared Taro UI
  src/services/    Calendar/presentation, auth session, API, demo/live repository
  src/types/       Typed domain contracts
  src/styles/      Shared cool-neutral design tokens
  tests/           Small pure domain tests
server/
  src/baby_server/ App factory, auth adapter, blueprints, validation, SQLite store
  tests/           Small API regression suite
  pyproject.toml   Dependencies and CLI
  uv.lock          Reproducible Python dependency resolution
nginx.conf.d/
  xiaoman.conf     Static H5 and API site include
systemd/
  xiaoman-api.service  API-only production service
docs/
  nginx-deployment.md
  implementation.md
  platform-setup.md
  barcode-recording.md
```

## Current Boundaries

One baby per account. Date and stock reminders appear when the app is opened; no subscription messages. Opened dates are notes, not medically inferred discard dates. Expiry reminders start 30 calendar days before a recorded expiry date. Real login, HTTPS deployment, WeChat platform privacy setup, and developer-tool/device testing require app-specific configuration. Version 0.1.4 was uploaded through the official Taro CLI on October 6, 2026, with explicit user approval. It has not been submitted for review or published. Actual camera scanning, WeChat developer-tool checks, and real-device checks remain unverified. The H5 website and API Nginx site are deployed on the existing machine with user approval.

Original line-icon source is in `client/scripts/generate-icons.py`; assets are included as source files. Regenerate with `uv run --with pillow python client/scripts/generate-icons.py` from the repository root. The app-brand icon is AI-generated using the user-requested `xdog-ai image` CLI. Its 1024px master and 512px PNG export are in `client/src/assets/brand/`; the exact prompt and generation provenance are in `client/design/generated/app-icon-v1/`. Existing tab/category icons remain the original code-generated line icons. The new app-brand artwork has not been uploaded or published.

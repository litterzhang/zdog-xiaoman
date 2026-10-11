# Platform Setup

## Local Development

- API: `127.0.0.1:8083` using Waitress.
- Optional H5 development server: `127.0.0.1:10087`; its `/api` proxy is used only when `TARO_APP_API_BASE_URL` is empty. Production uses a static H5 build, not this listener.
- WeChat output: `client/dist/weapp`.
- API database: `server/.data/baby.sqlite3`, ignored by version control.

## Before Real Login

1. Provision a dedicated zdog-auth client for this application; do not reuse Yizhu credentials.
2. Set `ZDOG_AUTH_ISSUER`, `ZDOG_AUTH_CLIENT_ID`, and `ZDOG_AUTH_CLIENT_SECRET` only on the server.
3. Associate the application's own WeChat mini-program identity with that auth client.
4. Use the app's real ID in `client/project.config.json`.
5. Configure an HTTPS API origin via `TARO_APP_API_BASE_URL` and WeChat request domains.
6. Configure explicit production allowed origins and hosts on the server.

## Before Publication

Complete operator/contact details and the platform privacy declaration. Test login and the main flow in Developer Tools and on a real device. Any upload, submission, or publication requires an explicit user request. No review automation is included.

## Manual Product Smoke Test

Enter local demo, set a nickname and expected date, verify the expected-baby greeting, add an item, record use and restock, edit its metadata, check the reminder filter, change to a born-baby profile, and reload. Device-local data should survive reloads and remain separate from live accounts.

## Verification Status (2026-10-04)

- API regression tests: 4 passed.
- Client domain tests: 4 passed.
- TypeScript and Ruff checks: passed.
- WeChat production build: passed. The generated manifest contains six pages, three native tabs, and the referenced tab icon files.
- H5 production build: passed, with the standard webpack entrypoint size warning (approximately 301 KiB uncompressed).
- Local API: running at `http://127.0.0.1:8083`; `/api/health` returns `status: ok`.
- H5: running at `http://127.0.0.1:10087`; the same-origin `/api/health` proxy reaches Flask.
- Browser smoke: passed on the running H5 app. It exercises expected-baby onboarding, item creation, expiry and opened dates, stock reduction, restock, movement history, metadata editing, reminder/search filters, born-baby profile changes, reload persistence, and deletion. No runtime exceptions; no horizontal overflow at a 320px viewport.
- Screenshot inspection: the login, home, and item screens use white, cool-neutral text, fine dividers, and no green or warm palette. Synthetic screenshots are available under `/tmp/baby-*.png`.
- WeChat Developer Tools: not checked; the application-specific AppID is still a placeholder.
- Real device: not checked.
- Live authentication: the adapter is implemented and its route contract is tested, but this runtime has no dedicated zdog-auth client credentials. Health truthfully reports `configured: false`; local demo is explicit and never impersonates live login.

The original sandbox restriction is resolved. Actual browser startup also uncovered two issues that build-only checks did not detect: a missing H5 HTML template and an unset public API environment variable leaving a browser reference to Node's `process`. Both were fixed and the full browser flow was rerun successfully. The shared write boundary also explicitly whitelists item draft fields so live metadata edits do not send server-owned IDs or timestamps rejected by the API. This payload rule is covered in the existing client test suite.

Run `./scripts/dev.sh` from the repository root to start both services; exit terminates both. The launcher cleanup was checked against both listener ports. Run `npm run smoke:h5` from `client/` for the optional single browser flow, without adding a review or security audit workflow.

Python and JavaScript dependencies were initially reused from existing local artifacts while registry access was unavailable. The independent lockfiles are included in the project; normal setup remains `uv sync --locked` and `npm ci`.

## Remaining External Configuration

To verify real WeChat sign-in, supply the application's own AppID and a dedicated zdog-auth machine client configuration in local environment files. Do not send credentials in chat or copy Yizhu's secrets. HTTPS deployment and platform privacy setup remain publication prerequisites, not tasks performed here. The local run is verified; live WeChat sign-in is not yet verified.

## Nginx Configuration (2026-10-05)

Created `nginx.conf.d/xiaoman.conf` using Yizhu's static-H5/separate-API architecture:

- Public H5: `https://xiaomanh5-h.942295.xyz`; local server name: `xiaomanh5.942295.xyz`.
- Public API: `https://xiaoman-h.942295.xyz/api/`; local server name: `xiaoman.942295.xyz`.
- Static root: `/home/zhang/workspace/zdog-xiaoman/client/dist/h5`.
- API upstream: `127.0.0.1:8083`, matching the current server environment.
- No production H5 application listener or port `10087` is required.
- Client API origin and server host/origin settings were updated. Existing auth credentials and other private settings were preserved.
- Dedicated zdog-auth ID/secret are now present in `server/.env`; their presence is not proof of a successful live sign-in. A running Python service needs a restart to load changed environment settings.
- System Nginx installation, reload, public ingress changes, publication, and real-device testing were not performed by this configuration change.

See `docs/nginx-deployment.md` for operator steps. The 2026-10-04 verification record above is historical, not a claim about the updated deployment's live state.

Nginx configuration verification passed in an isolated fixture using temporary TLS/log/cache paths and loopback test ports. TypeScript, 4 client tests, 4 server tests, Ruff, and both production builds passed. The built clients reference the intended public API origin. Updated Host/CORS settings were also verified without external auth calls. Global installation and live public routing remain unverified until operator deployment.

## Installation Completed (2026-10-05)

The user explicitly approved installation. The site include is installed under `/etc/nginx/conf.d/xiaoman.conf`; the real system configuration test passed and Nginx was reloaded. The API-only `xiaoman-api.service` is installed, active, and enabled at boot on port 8083. No production H5 application listener was started.

Only the H5 build tree received a persistent SELinux web-content label. SELinux remains Enforcing, and existing home permissions/global booleans were preserved. The API reads its `.env` within the application under the `zhang` account, not through the system manager; no credentials were copied or printed.

Local HTTPS static files, API health, domain separation, and public-H5 CORS were checked. Both public `-h` addresses return 200; the public H5 content matches the built page, and public API health reports the correct service and loaded auth configuration. DNS/public ingress/tunnel settings and WeChat publication were not changed. See `docs/nginx-deployment.md` for the complete installation record.

Final installation checks confirmed both installed files match the repository, the API service is active/enabled with no restarts after the corrected launch, and no H5 dev listener exists on port 10087. The public API CORS preflight returns 204 with `Access-Control-Allow-Origin: https://xiaomanh5-h.942295.xyz`.

## UI and Official Taro Workflow Update (2026-10-05)

The existing project goal now includes the read-only `zdog-mp/zdog-client` homepage as a UI reference. Xiaoman's six screens use light-gray page backgrounds, white small-radius cards, compact form/list spacing, ordinary type weights, and restrained gray-blue accents. In-page generic titles, English eyebrows, brand topbars, and custom page-navigation bars were removed. Native WeChat navigation and native tabs remain outside the content. Baby greetings and item names remain business content.

Build/watch commands use the official Taro CLI. Preview/upload use the official `@tarojs/plugin-mini-ci` plugin, with the same approach and pinned versions as Yizhu. The custom startup/browser helpers and staged-output override were removed. Historical records mentioning those helpers describe earlier verification only; they are no longer active commands. Icon-generation source is retained only as artwork provenance, not a build/upload workflow.

Only normal H5 and WeChat builds are executed for this refactor. Preview/upload require the application's own AppID and upload private key and explicit authorization; no WeChat upload or release has been performed.

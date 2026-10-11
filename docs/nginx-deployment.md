# Xiaoman Nginx Deployment

## Architecture

This follows the existing Yizhu pattern. Public `-h` names reach the existing ingress, which removes that suffix from the forwarded host and sends the request to local HTTPS. The local site configuration intentionally uses only the non-`-h` names.

```text
https://xiaomanh5-h.942295.xyz
  -> existing public ingress / tunnel
  -> local Host: xiaomanh5.942295.xyz
  -> Nginx serves client/dist/h5 directly

https://xiaoman-h.942295.xyz/api/...
  -> existing public ingress / tunnel
  -> local Host: xiaoman.942295.xyz
  -> Nginx preserves /api/... and proxies to 127.0.0.1:8083
```

There is no independent production H5 service. Port `10087` is optional development tooling only; it is not an Nginx upstream. The H5 domain returns 404 for `/api` and `/api/`; the API domain does not serve frontend pages. Missing static assets return 404 rather than the SPA document.

## Configuration

- Repository site include: `nginx.conf.d/xiaoman.conf`.
- Operator installation target: `/etc/nginx/conf.d/xiaoman.conf`.
- Static root: `/home/zhang/workspace/zdog-xiaoman/client/dist/h5`.
- Python API upstream: `127.0.0.1:8083`.
- Shared certificate: `/etc/nginx/ssl/942295/cert.pem`.
- Shared private key: `/etc/nginx/ssl/942295/key.pem`.
- Uses the existing `main` access-log format, like Yizhu.

The observed shared certificate covers `942295.xyz` and `*.942295.xyz`, with an expiry of October 30, 2026. Certificate renewal is an operator responsibility; this change does not request or renew certificates.

The existing public ingress must route the two new public hostnames to local HTTPS with the rewritten Host values. This repository change does not create DNS records, alter the public proxy, or start a new tunnel.

## Environment Settings

Keep the dedicated authentication values in `server/.env`. The relevant public networking settings are:

```dotenv
BABY_HOST=127.0.0.1
BABY_PORT=8083
BABY_ALLOWED_ORIGINS=http://127.0.0.1:10087,http://localhost:10087,https://xiaomanh5-h.942295.xyz,https://xiaomanh5.942295.xyz
BABY_ALLOWED_HOSTS=localhost,127.0.0.1,xiaoman.942295.xyz,xiaoman-h.942295.xyz
```

In `client/.env.local`:

```dotenv
TARO_APP_API_BASE_URL=https://xiaoman-h.942295.xyz
```

Do not append `/api` to the client base URL: the transport adds it. The browser Origin remains the public H5 URL even when the ingress rewrites the API request Host; this is why Flask's allowed origins and allowed hosts contain different names.

Backend environment changes require restarting `xiaoman-api.service`. The application loads `server/.env` under the `zhang` account; the systemd manager does not read that private home file through an `EnvironmentFile` directive. Client environment changes require rebuilding H5 and WeChat. Changing the Python port also requires updating the Nginx upstream and the optional Taro development proxy.

## Prepare the Build and API

```sh
npm --prefix client run build:h5
npm --prefix client run build:weapp
cd server
uv sync --locked
uv run baby-server
```

Do not run `dev:h5` as the production frontend. Its watch server serves H5 assets from memory and can clear the on-disk H5 build directory. Keep the final production build in `client/dist/h5` for Nginx.

## Operator Deployment Commands

Only execute these after explicit approval to install/reload the system site:

```sh
sudo install -m 644 nginx.conf.d/xiaoman.conf /etc/nginx/conf.d/xiaoman.conf
sudo nginx -t
sudo install -m 644 systemd/xiaoman-api.service /etc/systemd/system/xiaoman-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now xiaoman-api.service
sudo systemctl reload nginx
```

The Nginx worker needs read access to the build and traversal access to its parent directories. Follow the existing Yizhu machine setup; do not automatically broaden home-directory permissions or change SELinux policy. The existing nginx-only home traversal ACL was retained. With explicit user approval, only the H5 build directory received the persistent `httpd_sys_content_t` file-context rule and `restorecon`; home permissions and global SELinux booleans were not changed.

After deployment, verify the public H5 page, an actual JS asset, the generated app icon, and `https://xiaoman-h.942295.xyz/api/health`. Also verify a browser login from the public H5 origin and WeChat request-domain configuration. Do not treat an isolated syntax check as proof of public routing or live sign-in.

## Verification Performed

- Client type check and 4 domain tests passed.
- Server 4 API regression tests and Ruff passed, using this project's own virtual environment.
- H5 and WeChat production builds passed. H5 retains a standard webpack entrypoint size warning.
- Both generated bundles contain the correct public API origin; the H5 index is present on disk for static serving.
- Local Flask checks accepted the internal API Host and returned the correct CORS preflight response for the public H5 Origin. No external auth requests were made.
- An isolated `nginx -t` passed. The check copy substitutes a temporary test certificate, temporary log/cache paths, and unprivileged loopback test ports. The repository site retains the real shared certificate paths and ports 80/443.
- This pre-install verification did not cover the system deployment; the completed installation checks are recorded below.

## Installed State (October 5, 2026)

Installed with explicit user approval:

- `/etc/nginx/conf.d/xiaoman.conf` matches the repository site include. System `nginx -t` passed and Nginx was reloaded successfully.
- `/etc/systemd/system/xiaoman-api.service` matches the repository service unit, is active, and is enabled at boot. It runs only the Python API on `127.0.0.1:8083` using this project's virtual environment.
- The service launches through the system shell and lets the application load its own `.env` as `zhang`. An initial system-manager `EnvironmentFile` read was denied by the existing SELinux policy; that directive was removed rather than moving credentials or relaxing global policy.
- The H5 build directory alone has the persistent `httpd_sys_content_t` context, matching Yizhu's static-file setup. SELinux remains Enforcing; the pre-existing home ACL and global booleans were preserved.
- No Taro H5 development server was started. Production H5 is served from the on-disk build by Nginx. The final listener check showed the API on loopback port 8083 and no listener on port 10087; the API service was running with zero restarts after the corrected launch.

Verified using real HTTPS, without disabling certificate validation:

- Local H5 HTML, actual JS, and the generated app icon return 200; HTML/icon contents match the build/source exports.
- Local API health returns 200 and reports `auth.configured: true`.
- Public H5 `https://xiaomanh5-h.942295.xyz/` returns 200 and exactly matches the built HTML.
- Public API `https://xiaoman-h.942295.xyz/api/health` returns 200 and identifies `zdog-baby-server`.
- OPTIONS requests with the public H5 Origin receive 204 and the correct allow-origin header through both the local HTTPS API site and the public API ingress.
- H5 `/api/health`, API `/`, and a missing JS asset return 404 as intended.

The public checks used the user's HTTP proxy. No DNS records, public ingress configuration, tunnel configuration, WeChat uploads, or certificate renewals were changed. A configured auth client is not proof of successful account login; real sign-in and WeChat developer-tool/device checks remain separate.

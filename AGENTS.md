# Repository Guidelines

Respond to the user in Chinese. Keep identifiers, comments, and documentation in English; product UI copy is Chinese.

## Architecture

- `client/`: Taro + React + TypeScript + SCSS, built for WeChat and H5.
- `server/`: Flask application factory, Python, uv, pyproject.toml, SQLite.
- `docs/`: implementation notes and platform setup.
- Follow the architectural and restrained visual patterns of the read-only reference project `../yizhu`. Do not modify the reference project.
- Keep brand strings, tokens, domain types, transport, and presentation logic centralized.
- Use Taro components and APIs; do not use browser-only APIs in application code.

## Safety

Identity must come from trusted authentication, never from a client-supplied owner ID. All private reads and writes must be scoped to that identity. Demo data must be explicitly labeled and separate from live data. Never silently fall back to demo on API failure.

Do not commit secrets, private keys, generated builds, environments, or runtime databases. Do not publish, upload, or provision paid services without explicit user approval.

## Verification

Run client type checks, domain tests, and both builds. Run server pytest and Ruff. Report browser checks, WeChat developer-tool checks, and real-device checks separately. Preserve unrelated files and changes.

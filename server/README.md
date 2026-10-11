# Baby API

Run `uv sync --locked`, copy `.env.example` to `.env`, and run `uv run baby-server` from this directory. The API listens on `127.0.0.1:8083` by default.

Run tests with `uv run pytest` and lint with `uv run ruff check src tests`.

The default server has no demo auth bypass. Configure a dedicated zdog-auth machine client before real login. Data is stored in `.data/baby.sqlite3`; keep it outside any public static directory. SQLite WAL supports atomic stock movements within this small, single-server deployment. Backup the database using SQLite's backup API or stop the service before copying all database files.

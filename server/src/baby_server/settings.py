"""Environment configuration; credentials never enter frontend bundles."""

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database: Path = Path(".data/baby.sqlite3")
    catalog_database: Path | None = None
    apizero_api_key: str = field(default="", repr=False)
    catalog_gs1_daily_limit: int = 5
    catalog_http_proxy: str = ""
    catalog_user_agent: str = "Xiaoman/0.1.1 (https://xiaomanh5-h.942295.xyz)"
    auth_issuer: str = ""
    auth_client_id: str = ""
    auth_client_secret: str = ""
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:10087", "http://localhost:10087")
    allowed_hosts: tuple[str, ...] = ("127.0.0.1", "localhost")

    @classmethod
    def from_env(cls):
        defaults = cls()
        return cls(
            database=Path(os.getenv("BABY_DATABASE", str(defaults.database))),
            catalog_database=Path(os.environ["BABY_CATALOG_DATABASE"]) if os.getenv("BABY_CATALOG_DATABASE") else None,
            apizero_api_key=os.getenv("APIZERO_API_KEY", ""),
            catalog_gs1_daily_limit=max(0, min(5, int(os.getenv("BABY_GS1_DAILY_LIMIT", "5")))),
            catalog_http_proxy=os.getenv("BABY_CATALOG_HTTP_PROXY", ""),
            catalog_user_agent=os.getenv("BABY_CATALOG_USER_AGENT", defaults.catalog_user_agent),
            auth_issuer=os.getenv("ZDOG_AUTH_ISSUER", ""),
            auth_client_id=os.getenv("ZDOG_AUTH_CLIENT_ID", ""),
            auth_client_secret=os.getenv("ZDOG_AUTH_CLIENT_SECRET", ""),
            allowed_origins=tuple(filter(None, os.getenv(
                "BABY_ALLOWED_ORIGINS", ",".join(defaults.allowed_origins)
            ).split(","))),
            allowed_hosts=tuple(filter(None, os.getenv(
                "BABY_ALLOWED_HOSTS", ",".join(defaults.allowed_hosts)
            ).split(","))),
        )

"""Cache-first, ordered lookups with bounded supplier calls and no private-data sharing."""

import time

import requests

from baby_server.catalog_cache import CatalogCache
from baby_server.catalog_sources import (
    OPEN_PROVIDERS,
    PROVIDERS,
    catalog_barcode,
    generic_product_name,
    gtin14,
    matches,
    normalize_product,
    source_url,
    source_values,
)
from baby_server.errors import ApiError

# Keep the shared provenance validator available to existing inventory validation imports.
__all__ = ["CatalogClient", "PROVIDERS", "catalog_barcode", "source_values"]
FIELDS = "code,product_name,product_name_zh,product_name_en,brands,quantity,categories_tags"


class CatalogClient:
    def __init__(self, settings, *, fetch=None, clock=None):
        self.settings = settings
        self.fetch = fetch or requests.get
        path = settings.catalog_database or settings.database.with_name("catalog.sqlite3")
        self.cache = CatalogCache(path, clock=clock)

    def lookup(self, barcode, *, use_account_key=False):
        barcode = catalog_barcode(barcode)
        canonical = gtin14(barcode)
        cached = self.cache.get(canonical)
        if cached and self._usable_cache(cached):
            return self._cached(cached, barcode)
        if not self.cache.acquire(canonical):
            cached = self.cache.get(canonical)
            if cached and self._usable_cache(cached):
                return self._cached(cached, barcode)
            raise ApiError(409, "CATALOG_BUSY", "这个条码正在查询，请稍后重试；不会重复请求商品接口。")
        try:
            # Recheck after acquiring a cross-process lease, before spending any quota.
            cached = self.cache.get(canonical)
            if cached and self._usable_cache(cached):
                return self._cached(cached, barcode)
            deadline = time.monotonic() + 18
            providers = []
            partial = None
            for provider in PROVIDERS:
                status, suggestion = self._lookup_source(provider, barcode, use_account_key, deadline)
                providers.append({"provider": provider, "status": status})
                if suggestion and suggestion.get("nameComplete") is False:
                    partial = partial or suggestion
                    providers[-1]["status"] = "incomplete"
                    continue
                if suggestion:
                    result = {"barcode": barcode, "suggestions": [suggestion],
                              "providers": providers, "cached": False, "complete": True}
                    # Persist successful public metadata, not raw payloads, secrets or user inventory.
                    record = {**result, "providers": [{"provider": provider, "status": "found"}]}
                    self.cache.put(canonical, record)
                    return result
            complete = all(value["status"] in {"not_found", "skipped"} for value in providers)
            result = {"barcode": barcode, "suggestions": [partial] if partial else [], "providers": providers,
                      "cached": False, "complete": complete}
            if complete or partial:
                self.cache.put(canonical, result, ttl=300)
            return result
        finally:
            self.cache.release(canonical)

    @staticmethod
    def _usable_cache(result):
        # Old positive records without a SKU name must not permanently block enrichment.
        return all(value.get("nameComplete") is False or not generic_product_name(
            value["name"], value.get("details", {}).get("brand", "")
        ) for value in result["suggestions"])

    @staticmethod
    def _cached(result, barcode):
        suggestions = [{**value, "source": {**value["source"], "barcode": barcode},
                        "sourceUrl": source_url(value["source"]["provider"], barcode)}
                       for value in result["suggestions"]]
        return {**result, "barcode": barcode, "suggestions": suggestions, "cached": True}

    def _lookup_source(self, provider, barcode, use_account_key, deadline):
        key = self.settings.apizero_api_key if use_account_key else ""
        authenticated = bool(key)
        bucket = "open-catalogs" if provider in OPEN_PROVIDERS else (
            provider + (":account" if authenticated else ":anonymous")
        )
        if provider == "gs1" and not gtin14(barcode).lstrip("0").startswith("69"):
            # The supplier documents domestic-registration coverage only; do not waste quota.
            return "skipped", None
        paused = self.cache.cooldown(bucket)
        if paused:
            return paused, None
        remaining = deadline - time.monotonic()
        if remaining < 1:
            return "unavailable", None
        if provider == "apizero":
            limit, window = (200 if authenticated else 20), 86400
        elif provider == "gs1":
            limit, window = min(self.settings.catalog_gs1_daily_limit, 5 if authenticated else 2), 86400
        else:
            limit, window = 12, 60
        if not self.cache.reserve(bucket, limit, window):
            return "limited", None
        headers = {"User-Agent": self.settings.catalog_user_agent, "Accept": "application/json"}
        if provider in {"apizero", "gs1"}:
            path = "barcode-lookup" if provider == "apizero" else "barcode-gs1"
            url = f"https://v1.apizero.cn/api/{path}"
            params = {"barcode" if provider == "apizero" else "code": barcode}
            if key:
                headers["Authorization"] = f"Bearer {key}"
        else:
            url = f"{PROVIDERS[provider][1]}/api/v3/product/{barcode}"
            params = {"fields": FIELDS}
        proxy = self.settings.catalog_http_proxy
        connect = min(2, remaining / 3)
        read = min(6 if provider == "gs1" else 3, max(.1, remaining - connect - .2))
        try:
            response = self.fetch(url, params=params, headers=headers,
                                  timeout=(connect, read), allow_redirects=False,
                                  proxies={"http": proxy, "https": proxy} if proxy else {})
            if response.status_code == 429:
                self.cache.pause(bucket, "limited")
                return "limited", None
            if response.status_code in {401, 402, 403}:
                self.cache.pause(bucket, "restricted")
                return "restricted", None
            if response.status_code not in {200, 404} or len(response.content) > 256 * 1024:
                return "unavailable", None
            data = response.json()
            if not isinstance(data, dict):
                return "unavailable", None
            if provider in {"apizero", "gs1"}:
                if data.get("code") == 4030:
                    self.cache.pause(bucket, "limited")
                    return "limited", None
                if data.get("code") in {4010, 4022, 4031}:
                    self.cache.pause(bucket, "restricted")
                    return "restricted", None
                if data.get("code") != 0 or not isinstance(data.get("data"), dict):
                    return "unavailable", None
                product = data["data"]
                if product.get("found") is False:
                    return "not_found", None
                if product.get("found") is not True:
                    return "unavailable", None
            else:
                if response.status_code == 404 or data.get("status") == 0:
                    return "not_found", None
                product = data.get("product")
            if not isinstance(product, dict) or not matches(product, barcode):
                return "unavailable", None
            suggestion = normalize_product(provider, barcode, product)
            return ("found", suggestion) if suggestion else ("incomplete", None)
        except (requests.RequestException, ValueError, TypeError):
            return "unavailable", None

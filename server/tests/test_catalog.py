"""Small cache/pipeline regression suite; every supplier is stubbed, no quota is consumed."""

import json

import pytest
import requests

from baby_server import create_app
from baby_server.catalog import CatalogClient
from baby_server.errors import ApiError
from baby_server.settings import Settings

BARCODE = "6903148349557"


class Response:
    def __init__(self, payload, status=200):
        self.status_code = status
        self.payload = payload
        self.content = json.dumps(payload).encode()

    def json(self):
        return self.payload


def gs1_product(code):
    return {"barcode": code, "found": True, "name": "Example diapers (NB)20片",
            "brand": "Example", "category": "婴儿尿布", "specification": "20片",
            "price": 99, "sale_date": "2026-10-01", "official": {"private": "not cached"}}


def test_order_cache_restart_aliases_and_normalized_auto_fill(tmp_path):
    settings = Settings(database=tmp_path / "inventory.sqlite3", apizero_api_key="test-only-key")
    calls = []

    def fetch(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("barcode-lookup"):
            return Response({"code": 0, "data": {"found": True, "barcode": BARCODE, "name": "Example", "brand": "Example"}})
        if url.endswith("barcode-gs1"):
            return Response({"code": 0, "data": gs1_product(kwargs["params"]["code"])})
        pytest.fail("A supplier was called after a successful hit")

    catalog = CatalogClient(settings, fetch=fetch)
    catalog.cache.put("0" + BARCODE, {"barcode": BARCODE, "suggestions": [{
        "name": "Example", "details": {"brand": "Example"}, "category": "diapers",
        "source": {"provider": "apizero", "barcode": BARCODE, "fetchedAt": "2026-10-05T00:00:00+00:00"},
        "sourceUrl": "", "quantity": ""
    }], "providers": [], "complete": True})
    result = catalog.lookup(BARCODE, use_account_key=True)
    assert [url.rsplit("/", 1)[1] for url, _ in calls] == ["barcode-lookup", "barcode-gs1"]
    assert calls[0][1]["params"] == {"barcode": BARCODE}
    assert calls[1][1]["params"] == {"code": BARCODE}
    assert all(kwargs["headers"]["Authorization"] == "Bearer test-only-key" for _, kwargs in calls)
    suggestion = result["suggestions"][0]
    assert suggestion["category"] == "diapers"
    assert suggestion["details"] == {"brand": "Example", "piecesPerPack": 20, "size": "NB"}
    assert not {"price", "sale_date", "official", "quantity"}.intersection(suggestion["details"])
    assert "test-only-key" not in json.dumps(result)
    restart = CatalogClient(settings, fetch=lambda *args, **kwargs: pytest.fail("Cache miss"))
    cached = restart.lookup("0" + BARCODE, use_account_key=True)
    assert cached["cached"] is True
    assert cached["suggestions"][0]["source"]["barcode"] == "0" + BARCODE
    assert len(calls) == 2
    assert catalog.cache.acquire("00000012345678") is True
    with pytest.raises(ApiError) as busy:
        restart.lookup("12345678")
    assert busy.value.status == 409
    catalog.cache.release("00000012345678")


def test_failures_are_not_misses_and_provider_budgets_survive_restart(tmp_path):
    settings = Settings(database=tmp_path / "inventory.sqlite3", catalog_gs1_daily_limit=1)
    calls = []

    def unavailable(url, **kwargs):
        calls.append(url)
        if url.endswith("barcode-lookup"):
            raise requests.Timeout
        if url.endswith("barcode-gs1"):
            return Response({"code": 4030}, 429)
        return Response({"status": 0}, 404)

    client = CatalogClient(settings, fetch=unavailable)
    result = client.lookup(BARCODE)
    assert result["complete"] is False and result["cached"] is False
    assert client.cache.get("0" + BARCODE) is None
    restart = CatalogClient(settings, fetch=unavailable)
    restart.lookup(BARCODE)
    assert sum(url.endswith("barcode-gs1") for url in calls) == 1
    assert all("gds.org.cn" not in url for url in calls)
    assert client.cache.reserve("durable-test", 1, 86400)
    assert not restart.cache.reserve("durable-test", 1, 86400)
    # A confirmed complete miss is short-lived and remains usable across restarts.
    missing_settings = Settings(database=tmp_path / "other" / "inventory.sqlite3")
    missing_calls = []

    def missing(url, **kwargs):
        missing_calls.append(url)
        return Response({"code": 0, "data": {"found": False}}) if "apizero" in url else Response({"status": 0}, 404)

    missing_client = CatalogClient(missing_settings, fetch=missing)
    imported = "8718117613892"
    miss = missing_client.lookup(imported)
    assert miss["complete"] and not miss["suggestions"]
    assert all(not url.endswith("barcode-gs1") for url in missing_calls)
    assert missing_client.lookup(imported)["cached"]


def test_only_trusted_app_sessions_use_supplier_key_and_key_never_leaves_its_origin(tmp_path):
    settings = Settings(database=tmp_path / "inventory.sqlite3", apizero_api_key="supplier-test-key")
    calls = []

    class Auth:
        configured = True

        def userinfo(self, token):
            if token != "trusted-app-session":
                raise ApiError(401, "UNAUTHORIZED", "请先登录。")
            return {"sub": "parent"}

    def fetch(url, **kwargs):
        calls.append((url, kwargs))
        if "apizero.cn" in url:
            return Response({"code": 0, "data": {"found": False}})
        assert "Authorization" not in kwargs["headers"]
        return Response({"status": 0}, 404)

    app = create_app(settings, auth_client=Auth(), catalog_client=CatalogClient(settings, fetch=fetch))
    client = app.test_client()
    assert client.get(f"/api/catalog/products/{BARCODE}", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert not calls
    assert client.get(f"/api/catalog/products/{BARCODE}", headers={"Authorization": "Bearer trusted-app-session"}).status_code == 200
    assert all(kwargs["headers"].get("Authorization") == "Bearer supplier-test-key"
               for url, kwargs in calls if "apizero.cn" in url)
    before = len(calls)
    assert client.get(f"/api/catalog/products/{BARCODE}").json["cached"]
    assert len(calls) == before
    assert client.get("/api/catalog/products/not-a-gtin").status_code == 400

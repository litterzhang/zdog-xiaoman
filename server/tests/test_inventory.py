"""Small regression suite for the primary parent-facing flows."""

from pathlib import Path
from uuid import uuid4

import pytest

from baby_server import create_app
from baby_server.settings import Settings


class FakeAuth:
    configured = True

    def userinfo(self, token):
        return {"sub": "parent-two" if token == "other-parent" else "parent-one"}

    def post(self, path, payload):
        return {"access_token": "test-token"}


@pytest.fixture
def client(tmp_path: Path):
    app = create_app(Settings(database=tmp_path / "baby.sqlite3"), auth_client=FakeAuth())
    app.config["TESTING"] = True
    return app.test_client()


HEADERS = {"Authorization": "Bearer test-token"}
DRAFT = {"name": "Formula stage 1", "category": "formula", "unit": "can", "quantity": 3,
         "lowStock": 1, "expiresOn": "2027-01-01", "openedOn": None, "notes": "Shelf A"}


def create_item(client):
    response = client.post("/api/items", json=DRAFT, headers=HEADERS)
    assert response.status_code == 201
    return response.json


def test_profile_and_inventory_flow(client):
    assert client.get("/api/health").json["status"] == "ok"
    assert client.post("/api/auth/wechat", json={"code": "temporary-code"}).json == {
        "access_token": "test-token"
    }
    baby = {"name": "Little One", "status": "expected", "date": "2027-02-01"}
    assert client.post("/api/baby", json=baby, headers=HEADERS).json == baby
    item = create_item(client)
    snapshot = client.get("/api/snapshot", headers=HEADERS).json
    assert snapshot == {"baby": baby, "items": [item]}
    records = client.get(f"/api/items/{item['id']}/movements", headers=HEADERS).json
    assert records["movements"][0]["balance"] == 3


def test_movements_are_retry_safe_and_cannot_overdraw(client):
    item = create_item(client)
    path = f"/api/items/{item['id']}/movements"
    payload = {"id": str(uuid4()), "kind": "use", "amount": 2, "note": "Opened two cans"}
    first = client.post(path, json=payload, headers=HEADERS)
    retry = client.post(path, json=payload, headers=HEADERS)
    assert first.status_code == retry.status_code == 200
    assert first.json == retry.json
    assert retry.json["item"]["quantity"] == 1
    assert client.post(path, json={**payload, "amount": 1}, headers=HEADERS).status_code == 409
    assert client.post(path, json={**payload, "id": str(uuid4())}, headers=HEADERS).status_code == 400
    restock = client.post(path, json={"id": str(uuid4()), "kind": "restock", "amount": 3},
                          headers=HEADERS)
    assert restock.json["item"]["quantity"] == 4


def test_edit_preserves_stock_and_detects_stale_form(client):
    item = create_item(client)
    path = f"/api/items/{item['id']}"
    edit = {key: value for key, value in DRAFT.items() if key != "quantity"}
    edit.update(name="Formula batch B", revision=item["revision"])
    saved = client.post(path, json=edit, headers=HEADERS)
    assert saved.status_code == 200
    assert saved.json["quantity"] == 3
    assert client.post(path, json=edit, headers=HEADERS).status_code == 409
    assert client.post(f"{path}/delete", json={"revision": saved.json["revision"]},
                       headers=HEADERS).status_code == 200
    assert client.get("/api/snapshot", headers=HEADERS).json["items"] == []


def test_count_and_date_validation(client):
    assert client.post("/api/items", json={**DRAFT, "quantity": -1}, headers=HEADERS).status_code == 400
    assert client.post("/api/items", json={**DRAFT, "quantity": True}, headers=HEADERS).status_code == 400
    assert client.post("/api/items", json={**DRAFT, "expiresOn": "2026-02-30"},
                       headers=HEADERS).status_code == 400
    assert client.post("/api/baby", json={"name": "Baby", "status": "born", "date": "2100-01-01"},
                       headers=HEADERS).status_code == 400
    assert client.get("/api/snapshot").status_code == 401


def test_category_details_price_and_barcode_preserve_legacy_stock(client):
    draft = {**DRAFT, "unit": "g", "quantity": 400,
             "details": {"brand": "Example", "stage": "1段", "netWeightGrams": 800},
             "priceCents": 26850, "priceUnit": "罐", "barcode": "0123456789012",
             "catalogSource": {"provider": "food", "barcode": "0123456789012",
                               "fetchedAt": "2026-10-05T00:00:00+00:00"}}
    response = client.post("/api/items", json=draft, headers=HEADERS)
    assert response.status_code == 201
    item = response.json
    assert item["details"] == draft["details"]
    assert item["barcode"].startswith("0")
    assert item["priceCents"] == 26850
    assert item["catalogSource"] == draft["catalogSource"]
    path = f"/api/items/{item['id']}"
    edit = {key: value for key, value in draft.items() if key != "quantity"}
    edit["revision"] = item["revision"]
    assert client.post(path, json={**edit, "unit": "罐"}, headers=HEADERS).status_code == 400
    edit.update(priceCents=None, priceUnit=None, barcode=None, catalogSource=None)
    saved = client.post(path, json=edit, headers=HEADERS)
    assert saved.status_code == 200
    assert saved.json["quantity"] == 400
    assert saved.json["priceCents"] is None
    for extra in [{"category": "diapers"}, {"details": {"netWeightGrams": True}},
                  {"priceCents": 268.5}, {"details": {"stage": "NB"}}]:
        assert client.post("/api/items", json={**draft, **extra}, headers=HEADERS).status_code == 400
    diapers = {**DRAFT, "category": "diapers", "unit": "片",
               "details": {"size": "NB", "piecesPerPack": 52}}
    assert client.post("/api/items", json=diapers, headers=HEADERS).status_code == 201
    assert "details" not in create_item(client)


def test_daily_batch_usage_is_atomic_retry_safe_and_preserves_archive_history(client):
    first = create_item(client)
    second = client.post("/api/items", json={**DRAFT, "name": "Diapers", "category": "diapers",
                         "unit": "片", "quantity": 5}, headers=HEADERS).json
    payload = {"id": str(uuid4()), "occurredOn": "2026-10-01", "entries": [
        {"itemId": first["id"], "amount": 3, "note": "Used up"},
        {"itemId": second["id"], "amount": 6, "note": ""},
    ]}
    assert client.post("/api/usage/batches", json=payload, headers=HEADERS).status_code == 400
    assert len(client.get(f"/api/items/{first['id']}/movements", headers=HEADERS).json["movements"]) == 1
    assert {item["id"]: item["quantity"] for item in client.get("/api/snapshot", headers=HEADERS).json["items"]} == {first["id"]: 3, second["id"]: 5}
    other_headers = {"Authorization": "Bearer other-parent"}
    assert client.get("/api/usage?day=2026-10-01", headers=other_headers).json["records"] == []
    assert client.post("/api/usage/batches", json={**payload, "id": str(uuid4())}, headers=other_headers).status_code == 404
    payload["entries"][1]["amount"] = 2
    saved = client.post("/api/usage/batches", json=payload, headers=HEADERS)
    retry = client.post("/api/usage/batches", json=payload, headers=HEADERS)
    assert saved.status_code == retry.status_code == 200
    assert saved.json == retry.json
    assert saved.json["movements"][0]["balance"] == 0
    records = client.get("/api/usage?day=2026-10-01", headers=HEADERS).json["records"]
    assert len(records) == 2
    assert {record["itemName"] for record in records} == {DRAFT["name"], "Diapers"}
    assert client.get("/api/usage?day=2026-09-30", headers=HEADERS).json["records"] == []
    assert client.post("/api/usage/batches", json={**payload, "occurredOn": "2026-09-30"}, headers=HEADERS).status_code == 409
    assert client.post("/api/usage/batches", json={**payload, "id": str(uuid4()), "occurredOn": "2100-01-01"}, headers=HEADERS).status_code == 400
    duplicate = {**payload, "id": str(uuid4()), "entries": [payload["entries"][1]] * 2}
    assert client.post("/api/usage/batches", json=duplicate, headers=HEADERS).status_code == 400
    restock = client.post(f"/api/items/{first['id']}/movements", json={"id": str(uuid4()), "kind": "restock", "amount": 1}, headers=HEADERS)
    assert restock.json["item"]["quantity"] == 1
    assert len(client.get("/api/usage?day=2026-10-01", headers=HEADERS).json["records"]) == 2

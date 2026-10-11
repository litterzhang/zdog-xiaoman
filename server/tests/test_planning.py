"""Small regression suite for owner-scoped planning and reversible inventory."""

from uuid import uuid4

import pytest

from baby_server import create_app
from baby_server.settings import Settings


class FakeAuth:
    configured = True

    def userinfo(self, token):
        return {"sub": token}


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(database=tmp_path / "planning.sqlite3"), auth_client=FakeAuth())
    app.config["TESTING"] = True
    return app.test_client()


HEADERS = {"Authorization": "Bearer parent-one"}
OTHER = {"Authorization": "Bearer parent-two"}
DRAFT = {"name": "Test diapers", "category": "diapers", "unit": "片", "quantity": 10,
         "lowStock": 3, "expiresOn": None, "openedOn": None, "notes": ""}


def item(client, **overrides):
    return client.post("/api/items", json={**DRAFT, **overrides}, headers=HEADERS).json


def use(client, saved, amount=4):
    return client.post(f"/api/items/{saved['id']}/movements", json={"id": str(uuid4()),
                       "kind": "use", "amount": amount, "occurredOn": "2026-10-08"},
                       headers=HEADERS).json["movement"]


def balance(client, item_id):
    return next(value["quantity"] for value in client.get("/api/snapshot", headers=HEADERS)
                .json["items"] if value["id"] == item_id)


def test_correct_usage_preserves_evidence_and_retries_and_rejects_other_owner(client):
    saved = item(client)
    original = use(client, saved)
    payload = {"id": str(uuid4()), "movementId": original["id"], "replacement": {
        "amount": 2, "occurredOn": "2026-10-09", "note": "Fixed amount and date"}}
    assert client.post("/api/usage/corrections", json=payload, headers=OTHER).status_code == 404
    first = client.post("/api/usage/corrections", json=payload, headers=HEADERS)
    assert first.status_code == 200
    assert client.post("/api/usage/corrections", json=payload, headers=HEADERS).json == first.json
    assert balance(client, saved["id"]) == 8
    original_row = next(m for m in first.json["movements"] if m["id"] == original["id"])
    assert original_row["voidedAt"]
    assert any(m["kind"] == "undo" and m["balance"] == 10 for m in first.json["movements"])
    replacement = next(m for m in first.json["movements"] if m.get("replacesId"))
    assert replacement["amount"] == 2
    assert client.post("/api/usage/corrections", json={**payload, "id": str(uuid4())},
                       headers=HEADERS).status_code == 409
    exclusion = {"id": str(uuid4()), "movementId": replacement["id"], "excluded": True}
    assert client.post("/api/usage/exclusions", json=exclusion, headers=HEADERS).status_code == 200
    assert client.post("/api/usage/exclusions", json=exclusion, headers=HEADERS).status_code == 200
    assert balance(client, saved["id"]) == 8
    records = client.get("/api/usage?day=2026-10-09", headers=HEADERS).json["records"]
    assert len(records) == 1 and records[0]["excludeFromForecast"]
    undo = {"id": str(uuid4()), "movementId": replacement["id"]}
    assert client.post("/api/usage/corrections", json=undo, headers=HEADERS).status_code == 200
    assert balance(client, saved["id"]) == 10
    assert client.post("/api/usage/corrections", json={**undo, "id": str(uuid4()),
                       "replacement": {"amount": -1, "occurredOn": "2026-10-09"}},
                       headers=HEADERS).status_code == 400


def test_batch_undo_is_atomic_after_item_deletion_and_after_member_correction(client):
    first, second = item(client), item(client, name="Test formula")
    batch_id = str(uuid4())
    batch = client.post("/api/usage/batches", json={"id": batch_id, "occurredOn": "2026-10-09",
                        "entries": [{"itemId": first["id"], "amount": 10},
                                    {"itemId": second["id"], "amount": 3}]}, headers=HEADERS).json
    assert all(m["batchId"] == batch_id for m in batch["movements"])
    replacement_payload = {"id": str(uuid4()), "movementId": batch["movements"][0]["id"],
                           "replacement": {"amount": 8, "occurredOn": "2026-10-09"}}
    assert client.post("/api/usage/corrections", json=replacement_payload,
                       headers=HEADERS).status_code == 200
    undo = {"id": str(uuid4()), "batchId": batch_id}
    result = client.post("/api/usage/corrections", json=undo, headers=HEADERS)
    assert result.status_code == 200
    assert balance(client, first["id"]) == balance(client, second["id"]) == 10
    assert client.post("/api/usage/corrections", json=undo, headers=HEADERS).json == result.json
    deleted_batch = str(uuid4())
    client.post("/api/usage/batches", json={"id": deleted_batch, "occurredOn": "2026-10-09",
                "entries": [{"itemId": first["id"], "amount": 2},
                            {"itemId": second["id"], "amount": 2}]}, headers=HEADERS)
    revision = next(i["revision"] for i in client.get("/api/snapshot", headers=HEADERS).json["items"]
                    if i["id"] == second["id"])
    client.post(f"/api/items/{second['id']}/delete", json={"revision": revision}, headers=HEADERS)
    assert client.post("/api/usage/corrections", json={"id": str(uuid4()), "batchId": deleted_batch},
                       headers=HEADERS).status_code == 404
    assert balance(client, first["id"]) == 8


def test_shopping_restock_is_atomic_scoped_and_does_not_count_planned_stock(client):
    saved = item(client, quantity=0)
    draft = {"id": str(uuid4()), "itemId": saved["id"], "name": saved["name"],
             "plannedQuantity": 2, "plannedUnit": "包", "note": "Buy when needed"}
    entry = client.post("/api/shopping", json=draft, headers=HEADERS).json
    assert client.post("/api/shopping", json=draft, headers=HEADERS).json == entry
    assert client.get("/api/shopping", headers=OTHER).json["entries"] == []
    assert balance(client, saved["id"]) == 0
    assert client.post("/api/shopping", json={**draft, "id": str(uuid4())},
                       headers=HEADERS).status_code == 409
    purchase = {"id": str(uuid4()), "revision": entry["revision"], "action": "restock",
                "purchase": {"amount": 52, "itemRevision": saved["revision"],
                             "occurredOn": "2026-10-09", "priceCents": 9900,
                             "priceUnit": "包", "expiresOn": "2028-01-01"}}
    path = f"/api/shopping/{entry['id']}/actions"
    assert client.post(path, json=purchase, headers=OTHER).status_code == 404
    invalid = {**purchase, "purchase": {**purchase["purchase"], "itemRevision": 999}}
    assert client.post(path, json=invalid, headers=HEADERS).status_code == 409
    assert balance(client, saved["id"]) == 0
    assert client.get("/api/shopping", headers=HEADERS).json["entries"][0]["status"] == "pending"
    result = client.post(path, json=purchase, headers=HEADERS)
    assert result.status_code == 200
    assert client.post(path, json=purchase, headers=HEADERS).json == result.json
    assert balance(client, saved["id"]) == 52
    current = client.get("/api/snapshot", headers=HEADERS).json["items"][0]
    assert current["priceCents"] == 9900 and current["expiresOn"] == "2028-01-01"
    assert len(client.get(f"/api/items/{saved['id']}/movements", headers=HEADERS)
               .json["movements"]) == 2
    assert client.get("/api/shopping").status_code == 401


def test_shopping_manual_complete_delete_and_overflow_leave_stock_unchanged(client):
    saved = item(client, quantity=999999)
    manual = {"id": str(uuid4()), "name": "Future bottle", "plannedQuantity": 1,
              "plannedUnit": "个", "note": "", "itemId": None}
    entry = client.post("/api/shopping", json=manual, headers=HEADERS).json
    path = f"/api/shopping/{entry['id']}/actions"
    payload = {"id": str(uuid4()), "revision": 1, "action": "restock",
               "purchase": {"amount": 1, "itemRevision": 1, "occurredOn": "2026-10-09"}}
    assert client.post(path, json=payload, headers=HEADERS).status_code == 400
    linked = client.post("/api/shopping", json={**manual, "revision": 1, "itemId": saved["id"]},
                         headers=HEADERS).json
    retried_edit = client.post("/api/shopping", json={**manual, "revision": 1,
                                "itemId": saved["id"]}, headers=HEADERS)
    assert retried_edit.json == linked
    payload.update(id=str(uuid4()), revision=linked["revision"])
    assert client.post(path, json=payload, headers=HEADERS).status_code == 400
    done = {"id": str(uuid4()), "revision": linked["revision"], "action": "complete"}
    result = client.post(path, json=done, headers=HEADERS)
    assert result.status_code == 200
    assert balance(client, saved["id"]) == 999999
    delete = {"id": str(uuid4()), "revision": result.json["entry"]["revision"], "action": "delete"}
    assert client.post(path, json=delete, headers=HEADERS).status_code == 200
    assert client.post(path, json=delete, headers=HEADERS).status_code == 200
    assert client.get("/api/shopping", headers=HEADERS).json["entries"] == []

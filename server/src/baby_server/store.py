"""Owner-scoped SQLite persistence with atomic, idempotent inventory movements."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from uuid import UUID, uuid4, uuid5
from zoneinfo import ZoneInfo

from baby_server.errors import ApiError


class Store:
    def __init__(self, path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS babies (
                    owner TEXT PRIMARY KEY, data TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS items_owner ON items(owner);
                CREATE TABLE IF NOT EXISTS movements (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, item_id TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS movements_item ON movements(owner, item_id);
                CREATE TABLE IF NOT EXISTS actions (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, data TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS shopping (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS shopping_owner ON shopping(owner);
                CREATE TABLE IF NOT EXISTS usage_batches (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, data TEXT NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def load_item(db, owner, item_id):
        row = db.execute("SELECT data FROM items WHERE id=? AND owner=?",
                         (item_id, owner)).fetchone()
        if not row:
            raise ApiError(404, "NOT_FOUND", "用品不存在。")
        return json.loads(row["data"])

    @staticmethod
    def write_item(db, item):
        db.execute("UPDATE items SET data=? WHERE id=?", (json.dumps(item), item["id"]))

    def snapshot(self, owner):
        with self.connect() as db:
            db.execute("BEGIN")
            baby = db.execute("SELECT data FROM babies WHERE owner=?", (owner,)).fetchone()
            items = [json.loads(row["data"]) for row in db.execute(
                "SELECT data FROM items WHERE owner=? ORDER BY rowid DESC", (owner,)
            )]
            usage = self.recent_usage(db, owner)
        result = {"baby": json.loads(baby["data"]) if baby else None, "items": items}
        if usage:
            result["usage"] = usage
        return result

    def save_baby(self, owner, data):
        with self.connect() as db:
            db.execute("INSERT INTO babies VALUES (?, ?) ON CONFLICT(owner) "
                       "DO UPDATE SET data=excluded.data", (owner, json.dumps(data)))
        return data

    def create_item(self, owner, data):
        item = {**data, "id": str(uuid4()), "revision": 1,
                "createdAt": datetime.now(UTC).isoformat()}
        with self.connect() as db:
            db.execute("INSERT INTO items VALUES (?, ?, ?)",
                       (item["id"], owner, json.dumps(item)))
            movement = {"id": str(uuid4()), "itemId": item["id"], "kind": "initial",
                        "amount": item["quantity"], "balance": item["quantity"],
                        "createdAt": item["createdAt"], "note": "初始库存"}
            db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                       (movement["id"], owner, item["id"], "initial", json.dumps(movement)))
        return item

    def update_item(self, owner, item_id, data, revision):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            item = self.load_item(db, owner, item_id)
            if item["revision"] != revision:
                raise ApiError(409, "CONFLICT", "库存已发生变化，请重新打开后编辑。")
            if data["category"] != item["category"] or data["unit"] != item["unit"]:
                raise ApiError(400, "INVALID_REQUEST", "已有库存的分类和单位不能更改，请新建记录。")
            if "barcode" in data and data["barcode"] != item.get("barcode"):
                if "catalogSource" not in data:
                    item["catalogSource"] = None
            item.update(data)
            item["revision"] += 1
            self.write_item(db, item)
        return item

    def delete_item(self, owner, item_id, revision):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            item = self.load_item(db, owner, item_id)
            if item["revision"] != revision:
                raise ApiError(409, "CONFLICT", "用品已发生变化，请刷新后重试。")
            db.execute("DELETE FROM items WHERE id=? AND owner=?", (item_id, owner))
            db.execute("DELETE FROM movements WHERE item_id=? AND owner=?", (item_id, owner))

    def history(self, owner, item_id):
        with self.connect() as db:
            self.load_item(db, owner, item_id)
            return [self.movement_value(row) for row in db.execute(
                "SELECT data, fingerprint FROM movements WHERE owner=? AND item_id=? ORDER BY rowid DESC",
                (owner, item_id),
            )]

    def move(self, owner, item_id, operation_id, kind, amount, note, occurred_on=None):
        values = [item_id, kind, amount, note]
        if occurred_on is not None:
            values.append(occurred_on)
        fingerprint = json.dumps(values, ensure_ascii=False)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            item = self.load_item(db, owner, item_id)
            previous = db.execute("SELECT owner, fingerprint, data FROM movements WHERE id=?",
                                  (operation_id,)).fetchone()
            if previous:
                if previous["owner"] != owner or previous["fingerprint"] != fingerprint:
                    raise ApiError(409, "CONFLICT", "记录编号已使用，请重新操作。")
                return {"item": item, "movement": json.loads(previous["data"])}
            balance = item["quantity"] + (amount if kind == "restock" else -amount)
            if not 0 <= balance <= 999999:
                raise ApiError(400, "INVALID_QUANTITY", "库存不足，或补货数量超过上限。")
            item["quantity"] = balance
            item["revision"] += 1
            movement = {"id": operation_id, "itemId": item_id, "kind": kind,
                        "amount": amount, "balance": balance, "note": note,
                        "createdAt": datetime.now(UTC).isoformat()}
            if occurred_on is not None:
                movement["occurredOn"] = occurred_on
            self.write_item(db, item)
            db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                       (operation_id, owner, item_id, fingerprint, json.dumps(movement)))
        return {"item": item, "movement": movement}

    @staticmethod
    def movement_day(movement):
        return movement.get("occurredOn") or datetime.fromisoformat(
            movement["createdAt"]
        ).astimezone(ZoneInfo("Asia/Shanghai")).date().isoformat()

    def daily_usage(self, owner, day):
        with self.connect() as db:
            db.execute("BEGIN")
            rows = db.execute(
                "SELECT m.data AS movement, m.fingerprint, i.data AS item FROM movements m "
                "JOIN items i ON i.id=m.item_id AND i.owner=m.owner "
                "WHERE m.owner=? ORDER BY m.rowid DESC", (owner,)
            ).fetchall()
            result = []
            for row in rows:
                movement = self.movement_value({"data": row["movement"], "fingerprint": row["fingerprint"]})
                item = json.loads(row["item"])
                if movement["kind"] == "use" and self.movement_day(movement) == day:
                    result.append({**movement, "itemName": item["name"],
                                   "unit": item["unit"], "category": item["category"]})
        return result

    def checkout_usage(self, owner, batch_id, day, entries):
        fingerprint = json.dumps([day, entries], ensure_ascii=False, sort_keys=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT * FROM usage_batches WHERE id=?", (batch_id,)).fetchone()
            if previous:
                if previous["owner"] != owner or previous["fingerprint"] != fingerprint:
                    raise ApiError(409, "CONFLICT", "提交编号已使用，请重新操作。")
                return json.loads(previous["data"])
            prepared = []
            for entry in entries:
                item = self.load_item(db, owner, entry["itemId"])
                if entry["amount"] > item["quantity"]:
                    raise ApiError(400, "INVALID_QUANTITY", f"{item['name']}库存不足，整批未扣减。")
                item["quantity"] -= entry["amount"]
                item["revision"] += 1
                prepared.append((item, entry))
            created_at = datetime.now(UTC).isoformat()
            movements = []
            for item, entry in prepared:
                movement = {"id": str(uuid5(UUID(batch_id), item["id"])), "itemId": item["id"],
                            "kind": "use", "amount": entry["amount"], "balance": item["quantity"],
                            "note": entry["note"], "occurredOn": day, "createdAt": created_at,
                            "batchId": batch_id}
                self.write_item(db, item)
                db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                           (movement["id"], owner, item["id"], batch_id, json.dumps(movement)))
                movements.append(movement)
            result = {"movements": movements}
            db.execute("INSERT INTO usage_batches VALUES (?, ?, ?, ?)",
                       (batch_id, owner, fingerprint, json.dumps(result)))
        return result

    @staticmethod
    def movement_value(row):
        movement = json.loads(row["data"])
        # Older batch records used the batch UUID as their persistence fingerprint.
        if movement["kind"] == "use" and not movement.get("batchId"):
            try:
                movement["batchId"] = str(UUID(row["fingerprint"]))
            except (ValueError, TypeError):
                pass
        return movement

    def recent_usage(self, db, owner):
        from datetime import timedelta

        from baby_server.validation import today

        start = (today() - timedelta(days=13)).isoformat()
        return [movement for row in db.execute(
            "SELECT data, fingerprint FROM movements WHERE owner=? ORDER BY rowid DESC", (owner,)
        ) if (movement := self.movement_value(row))["kind"] == "use"
            and self.movement_day(movement) >= start]

    @staticmethod
    def previous_action(db, owner, operation_id, fingerprint):
        row = db.execute("SELECT * FROM actions WHERE id=?", (operation_id,)).fetchone()
        if row:
            if row["owner"] != owner or row["fingerprint"] != fingerprint:
                raise ApiError(409, "CONFLICT", "操作编号已使用，请重新操作。")
            return json.loads(row["data"])
        return None

    @staticmethod
    def save_action(db, owner, operation_id, fingerprint, result):
        db.execute("INSERT INTO actions VALUES (?, ?, ?, ?)",
                   (operation_id, owner, fingerprint, json.dumps(result)))

    def correct_usage(self, owner, operation_id, target, replacement=None):
        fingerprint = json.dumps(["correction", target, replacement], sort_keys=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = self.previous_action(db, owner, operation_id, fingerprint)
            if previous is not None:
                return previous
            movements = [self.movement_value(row) for row in db.execute(
                "SELECT data, fingerprint FROM movements WHERE owner=?", (owner,)
            )]
            if target.get("batchId"):
                batch = db.execute("SELECT data FROM usage_batches WHERE id=? AND owner=?",
                                   (target["batchId"], owner)).fetchone()
                if not batch:
                    raise ApiError(404, "NOT_FOUND", "使用批次不存在。")
                # A deleted member must not silently turn an all-or-nothing undo into a partial one.
                for original in json.loads(batch["data"])["movements"]:
                    self.load_item(db, owner, original["itemId"])
                selected = [m for m in movements if m.get("batchId") == target["batchId"]
                            and m["kind"] == "use" and not m.get("voidedAt")]
            else:
                selected = [m for m in movements if m["id"] == target.get("movementId")]
            if not selected:
                raise ApiError(404, "NOT_FOUND", "使用记录不存在或已撤销。")
            if any(m["kind"] != "use" or m.get("voidedAt") for m in selected):
                raise ApiError(409, "CONFLICT", "这条记录已更正或撤销，请刷新。")
            prepared = {}
            for movement in selected:
                item_id = movement["itemId"]
                item = prepared.setdefault(item_id, self.load_item(db, owner, item_id))
                item["quantity"] += movement["amount"]
            if replacement:
                prepared[selected[0]["itemId"]]["quantity"] -= replacement["amount"]
            if any(not 0 <= item["quantity"] <= 999999 for item in prepared.values()):
                raise ApiError(400, "INVALID_QUANTITY", "更正后的库存不足或超过上限，整批未修改。")
            created_at = datetime.now(UTC).isoformat()
            changed = []
            for movement in selected:
                item = prepared[movement["itemId"]]
                movement.update(voidedAt=created_at, correctionId=operation_id)
                db.execute("UPDATE movements SET data=? WHERE id=? AND owner=?",
                           (json.dumps(movement), movement["id"], owner))
                restored = {"id": str(uuid5(UUID(operation_id), movement["id"])),
                            "itemId": item["id"], "kind": "undo", "amount": movement["amount"],
                            "balance": item["quantity"] + (replacement["amount"] if replacement else 0),
                            "note": "更正恢复" if replacement else "撤销使用",
                            "originalId": movement["id"], "createdAt": created_at}
                db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                           (restored["id"], owner, item["id"], operation_id, json.dumps(restored)))
                changed.extend([movement, restored])
            if replacement:
                source = selected[0]
                item = prepared[source["itemId"]]
                new_use = {"id": str(uuid5(UUID(operation_id), "replacement")),
                           "itemId": source["itemId"], "kind": "use", **replacement,
                           "balance": item["quantity"], "createdAt": created_at,
                           "replacesId": source["id"]}
                if source.get("batchId"):
                    new_use["batchId"] = source["batchId"]
                if source.get("excludeFromForecast"):
                    new_use["excludeFromForecast"] = True
                db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                           (new_use["id"], owner, item["id"], "replacement", json.dumps(new_use)))
                changed.append(new_use)
            for item in prepared.values():
                item["revision"] += 1
                self.write_item(db, item)
            result = {"movements": changed}
            self.save_action(db, owner, operation_id, fingerprint, result)
        return result

    def exclude_usage_day(self, owner, operation_id, movement_id, excluded):
        fingerprint = json.dumps(["exclude", movement_id, excluded])
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = self.previous_action(db, owner, operation_id, fingerprint)
            if previous is not None:
                return previous
            rows = db.execute("SELECT data, fingerprint FROM movements WHERE owner=?", (owner,))
            movements = [self.movement_value(row) for row in rows]
            source = next((m for m in movements if m["id"] == movement_id
                           and m["kind"] == "use" and not m.get("voidedAt")), None)
            if not source:
                raise ApiError(404, "NOT_FOUND", "有效使用记录不存在。")
            for movement in movements:
                if (movement["kind"] == "use" and movement["itemId"] == source["itemId"]
                        and self.movement_day(movement) == self.movement_day(source)):
                    movement["excludeFromForecast"] = excluded
                    db.execute("UPDATE movements SET data=? WHERE id=? AND owner=?",
                               (json.dumps(movement), movement["id"], owner))
            result = {"excluded": excluded}
            self.save_action(db, owner, operation_id, fingerprint, result)
        return result

    def shopping_list(self, owner):
        with self.connect() as db:
            return [json.loads(row["data"]) for row in db.execute(
                "SELECT data FROM shopping WHERE owner=? ORDER BY rowid DESC", (owner,)
            )]

    def save_shopping(self, owner, entry_id, data, revision):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT owner, data FROM shopping WHERE id=?", (entry_id,)).fetchone()
            previous = json.loads(row["data"]) if row and row["owner"] == owner else None
            if row and (not previous or previous["revision"] != revision
                        or previous["status"] != "pending"):
                # A retried identical creation must not add another entry.
                if (previous and previous["status"] == "pending"
                        and (revision is None or previous["revision"] == revision + 1)
                        and all(previous.get(k) == v for k, v in data.items())):
                    return previous
                raise ApiError(409, "CONFLICT", "待购记录已变化，请刷新。")
            if not row and revision is not None:
                raise ApiError(404, "NOT_FOUND", "待购记录不存在。")
            if data.get("itemId"):
                self.load_item(db, owner, data["itemId"])
                others = db.execute("SELECT data FROM shopping WHERE owner=? AND id<>?",
                                    (owner, entry_id))
                if any((entry := json.loads(r["data"])).get("itemId") == data["itemId"]
                       and entry["status"] == "pending" for r in others):
                    raise ApiError(409, "CONFLICT", "这件用品已在待购清单。")
            entry = {**data, "id": entry_id, "status": "pending",
                     "revision": previous["revision"] + 1 if previous else 1,
                     "createdAt": previous["createdAt"] if previous else datetime.now(UTC).isoformat()}
            db.execute("INSERT INTO shopping VALUES (?, ?, ?) ON CONFLICT(id) "
                       "DO UPDATE SET data=excluded.data", (entry_id, owner, json.dumps(entry)))
        return entry

    def shopping_action(self, owner, entry_id, operation_id, revision, action, purchase=None):
        fingerprint = json.dumps(["shopping", entry_id, revision, action, purchase], sort_keys=True)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = self.previous_action(db, owner, operation_id, fingerprint)
            if previous is not None:
                return previous
            row = db.execute("SELECT data FROM shopping WHERE id=? AND owner=?",
                             (entry_id, owner)).fetchone()
            if not row:
                raise ApiError(404, "NOT_FOUND", "待购记录不存在。")
            entry = json.loads(row["data"])
            if entry["revision"] != revision or (action != "delete" and entry["status"] != "pending"):
                raise ApiError(409, "CONFLICT", "待购记录已变化，请刷新。")
            created_at = datetime.now(UTC).isoformat()
            if action == "restock":
                if not entry.get("itemId"):
                    raise ApiError(400, "INVALID_REQUEST", "请先关联已保存的用品。")
                item = self.load_item(db, owner, entry["itemId"])
                if item["revision"] != purchase["itemRevision"]:
                    raise ApiError(409, "CONFLICT", "用品已变化，请刷新后确认补货。")
                item["quantity"] += purchase["amount"]
                if item["quantity"] > 999999:
                    raise ApiError(400, "INVALID_QUANTITY", "补货数量超过上限。")
                for key in ("priceCents", "priceUnit", "expiresOn", "openedOn"):
                    if key in purchase:
                        item[key] = purchase[key]
                item["revision"] += 1
                self.write_item(db, item)
                movement = {"id": str(uuid5(UUID(operation_id), "restock")),
                            "itemId": item["id"], "kind": "restock", "amount": purchase["amount"],
                            "balance": item["quantity"], "note": "待购清单补货",
                            "occurredOn": purchase["occurredOn"], "createdAt": created_at,
                            "shoppingId": entry_id}
                db.execute("INSERT INTO movements VALUES (?, ?, ?, ?, ?)",
                           (movement["id"], owner, item["id"], operation_id, json.dumps(movement)))
                entry["purchase"] = purchase
            entry.update(status="done", completedAt=created_at, revision=entry["revision"] + 1)
            if action == "delete":
                db.execute("DELETE FROM shopping WHERE id=? AND owner=?", (entry_id, owner))
            else:
                db.execute("UPDATE shopping SET data=? WHERE id=? AND owner=?",
                           (json.dumps(entry), entry_id, owner))
            result = {"entry": entry}
            self.save_action(db, owner, operation_id, fingerprint, result)
        return result

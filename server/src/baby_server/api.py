"""Baby profile and inventory routes; all ownership is derived from authentication."""

from uuid import UUID

from flask import Blueprint, current_app, g, request

from baby_server.auth import auth_required
from baby_server.errors import ApiError
from baby_server.validation import (
    ITEM_FIELDS,
    baby_values,
    body,
    count,
    date_value,
    invalid,
    item_values,
    text,
    today,
)


def usage_day(value):
    day = date_value(value)
    if day > today():
        invalid("使用日期须为今天或之前的有效日期。")
    return day.isoformat()


def store():
    return current_app.extensions["store"]


def create_api_blueprint():
    api = Blueprint("inventory", __name__, url_prefix="/api")

    @auth_required
    def authenticated_catalog_product(barcode):
        # Only trusted app sessions may spend the configured supplier-account allowance.
        return current_app.extensions["catalog"].lookup(barcode, use_account_key=True)

    @api.get("/catalog/products/<barcode>")
    def catalog_product(barcode):
        # Public metadata only: this endpoint never reads parent-owned inventory.
        if not current_app.extensions["catalog_limiter"].allow(request.remote_addr or "unknown"):
            raise ApiError(429, "CATALOG_RATE_LIMITED", "商品查询较频繁，请稍后重试。")
        if request.headers.get("Authorization"):
            return authenticated_catalog_product(barcode)
        return current_app.extensions["catalog"].lookup(barcode)

    @api.get("/snapshot")
    @auth_required
    def snapshot():
        return store().snapshot(g.user_id)

    @api.post("/baby")
    @auth_required
    def baby():
        return store().save_baby(g.user_id, baby_values(body({"name", "status", "date"})))

    @api.post("/items")
    @auth_required
    def create_item():
        return store().create_item(g.user_id, item_values(body(ITEM_FIELDS), creating=True)), 201

    @api.post("/items/<item_id>")
    @auth_required
    def update_item(item_id):
        data = body((ITEM_FIELDS - {"quantity"}) | {"revision"})
        revision = count(data.get("revision"))
        return store().update_item(g.user_id, item_id, item_values(data, creating=False), revision)

    @api.post("/items/<item_id>/delete")
    @auth_required
    def delete_item(item_id):
        data = body({"revision"})
        store().delete_item(g.user_id, item_id, count(data.get("revision")))
        return {"deleted": True}

    @api.get("/items/<item_id>/movements")
    @auth_required
    def history(item_id):
        return {"movements": store().history(g.user_id, item_id)}

    @api.post("/items/<item_id>/movements")
    @auth_required
    def move(item_id):
        data = body({"id", "kind", "amount", "note", "occurredOn"})
        operation_id = text(data, "id", 36)
        try:
            if str(UUID(operation_id)) != operation_id:
                invalid()
        except ValueError:
            invalid()
        if data.get("kind") not in {"restock", "use"}:
            invalid()
        amount = count(data.get("amount"))
        if amount == 0:
            invalid("记录数量须大于 0。")
        note = data.get("note", "")
        if not isinstance(note, str) or len(note) > 200:
            invalid()
        day = None
        if "occurredOn" in data:
            day = usage_day(data["occurredOn"])
        return store().move(g.user_id, item_id, operation_id, data["kind"], amount, note.strip(), day)

    @api.get("/usage")
    @auth_required
    def usage():
        day = usage_day(request.args.get("day", today().isoformat()))
        return {"records": store().daily_usage(g.user_id, day)}

    @api.post("/usage/batches")
    @auth_required
    def checkout():
        data = body({"id", "occurredOn", "entries"})
        batch_id = text(data, "id", 36)
        try:
            if str(UUID(batch_id)) != batch_id:
                invalid()
        except ValueError:
            invalid()
        day = usage_day(data.get("occurredOn"))
        entries = data.get("entries")
        if not isinstance(entries, list) or not 1 <= len(entries) <= 50:
            invalid("请添加 1 到 50 件用品。")
        clean, seen = [], set()
        for entry in entries:
            if not isinstance(entry, dict) or entry.keys() - {"itemId", "amount", "note"}:
                invalid()
            item_id = text(entry, "itemId", 36)
            if item_id in seen:
                invalid("同一件用品请合并数量后提交。")
            seen.add(item_id)
            amount = count(entry.get("amount"))
            note = entry.get("note", "")
            if amount == 0 or not isinstance(note, str) or len(note) > 200:
                invalid("请检查使用数量与备注。")
            clean.append({"itemId": item_id, "amount": amount, "note": note.strip()})
        return store().checkout_usage(g.user_id, batch_id, day, clean)

    return api

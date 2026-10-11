"""Trusted, owner-scoped correction and shopping commands."""

from uuid import UUID

from flask import Blueprint, current_app, g

from baby_server.auth import auth_required
from baby_server.validation import body, count, date_value, invalid, text, today


def identifier(data, key="id"):
    value = text(data, key, 36)
    try:
        if str(UUID(value)) != value:
            invalid()
    except ValueError:
        invalid()
    return value


def business_day(value):
    day = date_value(value)
    if day > today():
        invalid("日期不能晚于今天。")
    return day.isoformat()


def optional_note(data):
    value = data.get("note", "")
    if not isinstance(value, str) or len(value) > 200:
        invalid()
    return value.strip()


def create_planning_blueprint():
    api = Blueprint("planning", __name__, url_prefix="/api")

    @api.post("/usage/corrections")
    @auth_required
    def correction():
        data = body({"id", "movementId", "batchId", "replacement"})
        operation_id = identifier(data)
        if bool(data.get("movementId")) == bool(data.get("batchId")):
            invalid()
        target_key = "batchId" if data.get("batchId") else "movementId"
        target = {target_key: identifier(data, target_key)}
        replacement = data.get("replacement")
        if replacement is not None:
            if target_key != "movementId" or not isinstance(replacement, dict) or replacement.keys() - {
                "amount", "occurredOn", "note"
            }:
                invalid()
            amount = count(replacement.get("amount"))
            if not amount:
                invalid("更正数量须大于 0，撤销请使用撤销按钮。")
            replacement = {"amount": amount, "occurredOn": business_day(replacement.get("occurredOn")),
                           "note": optional_note(replacement)}
        return current_app.extensions["store"].correct_usage(
            g.user_id, operation_id, target, replacement
        )

    @api.post("/usage/exclusions")
    @auth_required
    def exclusion():
        data = body({"id", "movementId", "excluded"})
        if type(data.get("excluded")) is not bool:
            invalid()
        return current_app.extensions["store"].exclude_usage_day(
            g.user_id, identifier(data), identifier(data, "movementId"), data["excluded"]
        )

    @api.get("/shopping")
    @auth_required
    def shopping():
        return {"entries": current_app.extensions["store"].shopping_list(g.user_id)}

    @api.post("/shopping")
    @auth_required
    def save_shopping():
        data = body({"id", "revision", "itemId", "name", "plannedQuantity", "plannedUnit", "note"})
        entry_id = identifier(data)
        item_id = identifier(data, "itemId") if data.get("itemId") else None
        quantity = count(data.get("plannedQuantity"))
        if not quantity:
            invalid("待购数量须大于 0。")
        clean = {"itemId": item_id, "name": text(data, "name", 60),
                 "plannedQuantity": quantity, "plannedUnit": text(data, "plannedUnit", 8),
                 "note": optional_note(data)}
        revision = count(data["revision"]) if "revision" in data else None
        return current_app.extensions["store"].save_shopping(g.user_id, entry_id, clean, revision)

    @api.post("/shopping/<entry_id>/actions")
    @auth_required
    def shopping_action(entry_id):
        identifier({"id": entry_id})
        data = body({"id", "revision", "action", "purchase"})
        if data.get("action") not in {"delete", "complete", "restock"}:
            invalid()
        purchase = data.get("purchase")
        if data["action"] == "restock":
            if not isinstance(purchase, dict) or purchase.keys() - {
                "amount", "itemRevision", "occurredOn", "priceCents", "priceUnit", "expiresOn", "openedOn"
            }:
                invalid()
            clean = {"amount": count(purchase.get("amount")),
                     "itemRevision": count(purchase.get("itemRevision")),
                     "occurredOn": business_day(purchase.get("occurredOn"))}
            if not clean["amount"]:
                invalid("补货数量须大于 0。")
            for key in ("expiresOn", "openedOn"):
                if key in purchase:
                    value = date_value(purchase[key], optional=True)
                    if key == "openedOn" and value and value > today():
                        invalid("开封日期不能晚于今天。")
                    clean[key] = value.isoformat() if value else None
            if "priceCents" in purchase:
                value = purchase["priceCents"]
                clean["priceCents"] = count(value, maximum=99999999) if value is not None else None
                clean["priceUnit"] = text(purchase, "priceUnit", 8) if value is not None else None
            elif "priceUnit" in purchase:
                invalid()
            purchase = clean
        elif purchase is not None:
            invalid()
        return current_app.extensions["store"].shopping_action(
            g.user_id, entry_id, identifier(data), count(data.get("revision")), data["action"], purchase
        )

    return api

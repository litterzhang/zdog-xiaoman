"""Strict domain validation for counts and date-only values."""

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from flask import request

from baby_server.catalog import source_values
from baby_server.errors import ApiError
from baby_server.item_details import details_values

CATEGORIES = {"formula", "diapers", "feeding", "cleaning", "care", "clothing", "travel", "other"}
ITEM_FIELDS = {"name", "category", "unit", "quantity", "lowStock", "expiresOn", "openedOn", "notes",
               "details", "barcode", "priceCents", "priceUnit", "catalogSource"}


def invalid(message="请检查填写的信息。"):
    raise ApiError(400, "INVALID_REQUEST", message)


def today():
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def body(allowed):
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - allowed:
        invalid("请求格式不正确。")
    return data


def text(data, key, maximum, *, trim=True):
    value = data.get(key)
    if not isinstance(value, str):
        invalid()
    value = value.strip() if trim else value
    if not value or len(value) > maximum:
        invalid()
    return value


def count(value, maximum=999999):
    if type(value) is not int or not 0 <= value <= maximum:
        invalid("数量须为 0 到 999999 之间的整数。")
    return value


def date_value(value, *, optional=False):
    if value is None and optional:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        invalid("请选择有效日期。")
    try:
        result = date.fromisoformat(value)
    except ValueError:
        invalid("请选择有效日期。")
    if not date(1900, 1, 1) <= result <= date(2100, 12, 31):
        invalid("日期须在 1900 年至 2100 年之间。")
    return result


def baby_values(data):
    name = text(data, "name", 24)
    status = data.get("status")
    if status not in {"expected", "born"}:
        invalid()
    day = date_value(data.get("date"))
    if status == "born" and day > today():
        invalid("出生日期不能晚于今天。")
    return {"name": name, "status": status, "date": day.isoformat()}


def item_values(data, *, creating):
    name, unit = text(data, "name", 60), text(data, "unit", 8)
    if data.get("category") not in CATEGORIES:
        invalid()
    low_stock = count(data.get("lowStock"))
    expires = date_value(data.get("expiresOn"), optional=True)
    opened = date_value(data.get("openedOn"), optional=True)
    if opened and opened > today():
        invalid("开封日期不能晚于今天。")
    notes = data.get("notes", "")
    if not isinstance(notes, str) or len(notes) > 500:
        invalid("备注不能超过 500 字。")
    result = {"name": name, "category": data["category"], "unit": unit,
              "lowStock": low_stock, "expiresOn": expires.isoformat() if expires else None,
              "openedOn": opened.isoformat() if opened else None, "notes": notes.strip()}
    if "details" in data:
        result["details"] = details_values(data["category"], data["details"])
    if "barcode" in data:
        barcode = data["barcode"]
        if barcode is not None and (
            not isinstance(barcode, str) or not re.fullmatch(r"[\x20-\x7e]{1,80}", barcode)
            or not barcode.strip()
        ):
            invalid("商品条码须为 1 到 80 个有效字符。")
        result["barcode"] = barcode.strip() if barcode is not None else None
    if "catalogSource" in data:
        result["catalogSource"] = source_values(data["catalogSource"], result.get("barcode"))
    if "priceCents" in data:
        price = data["priceCents"]
        result["priceCents"] = count(price, maximum=99999999) if price is not None else None
        result["priceUnit"] = text(data, "priceUnit", 8) if price is not None else None
    elif "priceUnit" in data:
        invalid("请同时填写购入单价与价格单位。")
    if creating:
        result["quantity"] = count(data.get("quantity"))
    return result

"""Fixed supplier origins and conservative, source-attributed product normalization."""

import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from baby_server.errors import ApiError

PROVIDERS = {
    "apizero": ("ApiZero 商品反查", "https://apizero.cn/marketplace/barcode-lookup"),
    "gs1": ("ApiZero GS1 登记资料", "https://apizero.cn/marketplace/barcode-gs1"),
    "food": ("Open Food Facts", "https://world.openfoodfacts.org"),
    "products": ("Open Products Facts", "https://world.openproductsfacts.org"),
    "beauty": ("Open Beauty Facts", "https://world.openbeautyfacts.org"),
}
OPEN_PROVIDERS = {"food", "products", "beauty"}


def catalog_barcode(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{8}|[0-9]{12,14}", value):
        raise ApiError(400, "INVALID_BARCODE", "商品查询支持 8、12、13 或 14 位数字条码。")
    return value


def gtin14(value):
    return catalog_barcode(value).zfill(14)


def source_url(provider, barcode):
    origin = PROVIDERS[provider][1]
    if provider in OPEN_PROVIDERS:
        return f"{origin}/product/{barcode}"
    return origin


def source_values(value, barcode):
    if value is None:
        return None
    if (not isinstance(value, dict) or set(value) != {"provider", "barcode", "fetchedAt"}
            or not isinstance(value.get("provider"), str) or value["provider"] not in PROVIDERS
            or value.get("barcode") != barcode):
        raise ApiError(400, "INVALID_REQUEST", "商品资料来源与条码不匹配。")
    catalog_barcode(value["barcode"])
    fetched = value.get("fetchedAt")
    try:
        if not isinstance(fetched, str) or len(fetched) > 40:
            raise ValueError
        if datetime.fromisoformat(fetched).tzinfo is None:
            raise ValueError
    except ValueError:
        raise ApiError(400, "INVALID_REQUEST", "商品资料来源日期无效。") from None
    return {"provider": value["provider"], "barcode": barcode, "fetchedAt": fetched}


def text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def field(product, keys, limit):
    return next((text(product.get(key), limit) for key in keys
                 if text(product.get(key), limit)), "")


def generic_product_name(name, brand=""):
    value = re.sub(r"\s+", "", name).casefold()
    brand = re.sub(r"\s+", "", brand).casefold()
    labels = {"奶粉", "纸尿裤", "喂养", "清洁", "护理", "衣物", "出行", "其他"}
    return not value or (bool(brand) and value == brand) or value in labels or (
        bool(brand) and any(value in {brand + label, label + brand} for label in labels)
    )


def normalize_product(provider, barcode, product):
    name = field(product, ["product_name_zh", "RegulatedProductName", "name", "product_name",
                          "product_name_en", "ProductName", "Name"], 60)
    if not name:
        return None
    category = None
    tags = product.get("categories_tags", [])
    tags = {tag for tag in tags if isinstance(tag, str)} if isinstance(tags, list) else set()
    label = " ".join([name, field(product, ["general_name", "category", "gpcname"], 100)])
    if tags & {"en:infant-formulas", "en:baby-milks", "en:infant-milks", "en:follow-on-milks"}:
        category = "formula"
    elif tags & {"en:diapers", "en:nappies", "en:baby-diapers"}:
        category = "diapers"
    elif tags & {"en:baby-bottles", "en:feeding-bottles"}:
        category = "feeding"
    elif provider not in OPEN_PROVIDERS:
        if re.search(r"纸尿裤|尿布|尿不湿|拉拉裤", label):
            category = "diapers"
        elif "奶粉" in label:
            category = "formula"
        elif re.search(r"奶瓶|奶嘴|储奶袋", label):
            category = "feeding"
        elif re.search(r"湿巾|棉柔巾", label):
            category = "cleaning"
        elif re.search(r"沐浴|洗发|护肤|润肤", label):
            category = "care"
    if provider == "beauty":
        category = "care"
    quantity = field(product, ["specification", "net_content", "spec", "quantity", "Specification"], 80)
    details = {}
    brand = field(product, ["brandcn", "brand", "brands", "BrandName"], 40)
    if brand:
        details["brand"] = brand
    match = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s*(g|kg|克|千克)", quantity, re.IGNORECASE)
    if category == "formula" and match:
        try:
            grams = Decimal(match[1].replace(",", ".")) * (
                1000 if match[2].lower() in {"kg", "千克"} else 1
            )
            if grams == grams.to_integral_value() and 0 < grams <= 999999:
                details["netWeightGrams"] = int(grams)
        except InvalidOperation:
            pass
    match = re.fullmatch(r"(\d+)\s*(?:片|枚|pieces?|pcs?)", quantity, re.IGNORECASE)
    if category == "diapers" and match and 0 < int(match[1]) <= 999999:
        details["piecesPerPack"] = int(match[1])
    if category == "diapers":
        size = re.search(r"(?<![A-Za-z0-9])(XXXL|XXL|XL|NB|S|M|L)(?![A-Za-z0-9])", name)
        if size:
            details["size"] = size[1]
    return {"name": name, "category": category, "quantity": quantity, "details": details,
            "nameComplete": not generic_product_name(name, brand),
            "source": {"provider": provider, "barcode": barcode,
                       "fetchedAt": datetime.now(UTC).isoformat()},
            "sourceUrl": source_url(provider, barcode)}


def product_code(product):
    for key in ["gtin14", "gtin", "GTIN", "barcode", "ean", "upc", "code"]:
        value = product.get(key)
        if value is not None:
            return str(value)
    return None


def matches(product, barcode):
    value = product_code(product)
    try:
        return value is not None and gtin14(value) == gtin14(barcode)
    except ApiError:
        return False



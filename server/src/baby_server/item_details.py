"""Category-specific metadata, independent of inventory balances."""

from baby_server.errors import ApiError

STAGES = {"1段", "2段", "3段", "4段", "特殊配方", "其他"}
DIAPER_SIZES = {"NB", "S", "M", "L", "XL", "XXL", "XXXL", "其他"}
DETAIL_FIELDS = {
    "formula": {"brand": str, "stage": STAGES, "netWeightGrams": int},
    "diapers": {"brand": str, "size": DIAPER_SIZES, "piecesPerPack": int},
    "feeding": {"brand": str, "capacityMl": int, "material": str},
    "cleaning": {"brand": str, "piecesPerPack": int},
    "care": {"brand": str, "volumeMl": int},
    "clothing": {"size": str},
    "travel": {"brand": str, "model": str},
    "other": {},
}


def details_values(category, values):
    fields = DETAIL_FIELDS[category]
    if not isinstance(values, dict) or values.keys() - fields.keys():
        raise ApiError(400, "INVALID_REQUEST", "分类信息不匹配，请重新选择分类。")
    result = {}
    for key, value in values.items():
        rule = fields[key]
        if rule is int:
            valid = type(value) is int and 0 < value <= 999999
        else:
            valid = isinstance(value, str) and 0 < len(value.strip()) <= 40
            if isinstance(rule, set):
                valid = valid and value in rule
        if not valid:
            raise ApiError(400, "INVALID_REQUEST", "请检查分类信息。")
        result[key] = value.strip() if isinstance(value, str) else value
    return result

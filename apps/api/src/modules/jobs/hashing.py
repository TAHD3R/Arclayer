from hashlib import sha256

from orjson import OPT_SORT_KEYS, dumps

from src.common.types.json_types import JsonObject


def hash_json(payload: JsonObject) -> str:
    return sha256(dumps(payload, option=OPT_SORT_KEYS)).hexdigest()

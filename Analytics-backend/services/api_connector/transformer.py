from collections.abc import Iterable


def flatten_json(data, parent_key: str = "", sep: str = ".") -> dict:
    items = []
    if isinstance(data, dict):
        for key, value in data.items():
            new_key = f"{parent_key}{sep}{key}" if parent_key else str(key)
            items.extend(flatten_json(value, new_key, sep=sep).items())
    elif isinstance(data, list):
        for idx, value in enumerate(data):
            new_key = f"{parent_key}{sep}{idx}" if parent_key else str(idx)
            items.extend(flatten_json(value, new_key, sep=sep).items())
    else:
        items.append((parent_key, data))
    return dict(items)


def to_rows(payload) -> list[dict]:
    if isinstance(payload, list):
        raw_rows = payload
    elif isinstance(payload, dict):
        raw_rows = [payload]
    else:
        raw_rows = [{"value": payload}]
    rows = []
    for row in raw_rows:
        if isinstance(row, dict):
            rows.append(flatten_json(row))
        elif isinstance(row, Iterable) and not isinstance(row, (str, bytes)):
            rows.append(flatten_json({"value": list(row)}))
        else:
            rows.append({"value": row})
    return rows


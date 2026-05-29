from datetime import datetime


def _detect_type(value):
    if value is None:
        return "string"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "float"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return "string"
        try:
            datetime.fromisoformat(s.replace("Z", "+00:00"))
            return "datetime"
        except Exception:
            return "string"
    return "string"


def detect_schema(rows: list[dict]) -> list[dict]:
    by_field = {}
    for row in rows:
        for key, value in row.items():
            by_field.setdefault(key, []).append(value)

    fields = []
    for field_name, values in by_field.items():
        sample = next((v for v in values if v is not None), None)
        dtype = _detect_type(sample)
        is_measure = dtype in {"integer", "float"}
        is_date = dtype == "datetime"
        is_dimension = dtype in {"string", "boolean", "datetime"}
        fields.append(
            {
                "field_name": field_name,
                "display_name": field_name.replace(".", " ").replace("_", " ").title(),
                "data_type": dtype,
                "field_category": "measure" if is_measure else "dimension",
                "is_dimension": is_dimension,
                "is_measure": is_measure,
                "is_date_field": is_date,
                "sample_value": "" if sample is None else str(sample)[:500],
            }
        )
    return fields


import requests
import json

endpoints = {
    "ETL Backend (8000)": "http://127.0.0.1:8000/etl/api/v1/system/status",
    "DW Backend (8004)": "http://127.0.0.1:8004/dw/catalog/list",
    "Analytics Backend (8010)": "http://127.0.0.1:8010/analytics/api/v1/health"
}

for name, url in endpoints.items():
    try:
        r = requests.get(url, timeout=5)
        print(f"{name}: SUCCESS (Status Code: {r.status_code})")
        try:
            print("Response:", json.dumps(r.json(), indent=2)[:300])
        except Exception:
            print("Response (text):", r.text[:300])
    except Exception as e:
        print(f"{name}: FAILED - {e}")

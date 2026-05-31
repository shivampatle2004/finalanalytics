import requests

PIPELINE_ID = "077a73b5-1dc2-4f75-9e37-b2c6dbb7829b"
URL = f"http://127.0.0.1:8000/etl/api/v1/pipelines/{PIPELINE_ID}"

def test_update():
    payload = {
        "name": "Updated Test Save Pipeline 1",
        "description": "An updated test pipeline",
        "dag_definition": {
            "nodes": [
                {
                    "id": "node_1",
                    "type": "extract",
                    "position": {"x": 120, "y": 120},
                    "data": {
                        "label": "New Extract Label"
                    }
                }
            ],
            "edges": []
        }
    }
    
    res = requests.put(URL, json=payload)
    print("Status Code:", res.status_code)
    print("Response JSON:", res.json())

if __name__ == "__main__":
    test_update()

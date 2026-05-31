import requests

URL = "http://127.0.0.1:8000/etl/api/v1/pipelines"

def test_save():
    payload = {
        "name": "Test Save Pipeline 1",
        "description": "A test pipeline",
        "dag_definition": {
            "nodes": [
                {
                    "id": "node_1",
                    "type": "extract",
                    "position": {"x": 100, "y": 100},
                    "data": {
                        "label": "New Extract"
                    }
                }
            ],
            "edges": []
        }
    }
    
    res = requests.post(URL, json=payload)
    print("Status Code:", res.status_code)
    print("Response JSON:", res.json())

if __name__ == "__main__":
    test_save()

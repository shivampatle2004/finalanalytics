import requests
import json
import time

PIPELINES_URL = "http://127.0.0.1:8000/etl/api/v1/pipelines"

# 1. Create a dummy pipeline
payload = {
    "name": f"Dummy Pipeline for Delete Test {int(time.time())}",
    "description": "Delete test description",
    "dag_definition": {
        "nodes": [
            {
                "id": "node_1",
                "type": "extract",
                "position": {"x": 100, "y": 100},
                "data": {
                    "label": "Extract",
                    "connector_engine": "csv",
                    "config": {
                        "file_path": "uploads/non_existent.csv",
                        "output_file_name": "non_existent_raw"
                    }
                }
            }
        ],
        "edges": []
    }
}

res = requests.post(PIPELINES_URL, json=payload)
if res.status_code != 201:
    print("Failed to create pipeline:", res.status_code, res.text)
    exit(1)

pipeline_id = res.json()["id"]
print("Created pipeline ID:", pipeline_id)

# 2. Trigger execution to create a job (which will fail immediately because file doesn't exist, creating job, job run, logs, etc.)
execute_url = f"{PIPELINES_URL}/{pipeline_id}/execute"
res = requests.post(execute_url)
if res.status_code != 200:
    print("Failed to execute pipeline:", res.status_code, res.text)
    exit(1)

job_id = res.json()["job_id"]
print("Triggered execution Job ID:", job_id)

# Wait 3 seconds for uvicorn to process and log the failure
time.sleep(3)

# 3. Try to delete the pipeline
delete_url = f"{PIPELINES_URL}/{pipeline_id}"
res = requests.delete(delete_url)
print("Delete Status Code:", res.status_code)
if res.status_code != 204:
    print("Delete failed:", res.text)
else:
    print("Delete pipeline success!")

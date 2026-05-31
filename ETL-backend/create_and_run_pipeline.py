import asyncio
import requests
import time

CREATE_URL = "http://127.0.0.1:8000/etl/api/v1/pipelines"
# Find our uploaded file from directory listing
import os
uploads_dir = "uploads"
csv_files = [f for f in os.listdir(uploads_dir) if f.endswith(".csv")]
if not csv_files:
    # Upload one first
    print("No CSV files found in uploads, creating one...")
    with open("uploads/test_run.csv", "w") as f:
        f.write("id,name,amount\n1,Raju,100\n2,Sanket,200\n3,Shivraj,300\n")
    csv_file = "test_run.csv"
else:
    csv_file = csv_files[0]

csv_path = os.path.abspath(os.path.join(uploads_dir, csv_file))
print("Using CSV file path:", csv_path)

def create_and_run():
    # 1. Create pipeline
    payload = {
        "name": f"CSV to DW Pipeline {int(time.time())}",
        "description": "Orchestrated test run",
        "dag_definition": {
            "nodes": [
                {
                    "id": "node_extract",
                    "type": "extract",
                    "position": {"x": 100, "y": 100},
                    "data": {
                        "label": "Extract CSV",
                        "connector_engine": "csv",
                        "config": {
                            "file_path": csv_path,
                            "delimiter": ",",
                            "chunk_size": 1000,
                            "output_file_name": "csv_raw"
                        }
                    }
                },
                {
                    "id": "node_load",
                    "type": "load",
                    "position": {"x": 400, "y": 100},
                    "data": {
                        "label": "Load to DW",
                        "connector_engine": "warehouse",
                        "config": {
                            "output_format": "database",
                            "catalog": "shivraj",
                            "table_name": "orders"
                        }
                    }
                }
            ],
            "edges": [
                {
                    "id": "edge_1",
                    "source": "node_extract",
                    "target": "node_load"
                }
            ]
        }
    }
    
    res = requests.post(CREATE_URL, json=payload)
    if res.status_code != 201:
        print("Pipeline creation failed:", res.status_code, res.text)
        return
        
    pipeline = res.json()
    pipeline_id = pipeline["id"]
    print("Created pipeline with ID:", pipeline_id)
    
    # 2. Run pipeline
    execute_url = f"http://127.0.0.1:8000/etl/api/v1/pipelines/{pipeline_id}/execute"
    res = requests.post(execute_url)
    if res.status_code != 200:
        print("Pipeline execution trigger failed:", res.status_code, res.text)
        return
        
    job = res.json()
    job_id = job["job_id"]
    print("Queued job with ID:", job_id)
    
    # 3. Poll job status
    job_status_url = f"http://127.0.0.1:8000/etl/api/v1/jobs/{job_id}"
    for i in range(15):
        time.sleep(1)
        res = requests.get(job_status_url)
        if res.status_code != 200:
            print("Failed to fetch job status:", res.status_code, res.text)
            break
        job_data = res.json()
        status = job_data["status"]
        print(f"Polling attempt {i+1}: status = {status}")
        if status in ["success", "failed", "cancelled"]:
            if status == "failed":
                print("Job failed with error:", job_data.get("error_message"))
            else:
                print("Job completed successfully!")
            break

if __name__ == "__main__":
    create_and_run()

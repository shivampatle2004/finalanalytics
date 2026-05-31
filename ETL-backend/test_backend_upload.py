import requests
import os

URL = "http://127.0.0.1:8000/etl/api/v1/upload"

def test_upload():
    # Create a small dummy CSV file
    file_content = "id,name,value\n1,Alice,100\n2,Bob,200\n"
    temp_filename = "dummy_test_upload.csv"
    with open(temp_filename, "w") as f:
        f.write(file_content)
        
    try:
        with open(temp_filename, "rb") as f:
            files = {"file": (temp_filename, f, "text/csv")}
            res = requests.post(URL, files=files)
            print("Status Code:", res.status_code)
            print("Response JSON:", res.json())
    except Exception as e:
        print("Upload failed:", e)
    finally:
        if os.path.exists(temp_filename):
            os.remove(temp_filename)

if __name__ == "__main__":
    test_upload()

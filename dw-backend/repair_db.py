import os
from pathlib import Path
from pymongo import MongoClient
from dotenv import load_dotenv

# Load .env from the dw-backend directory
load_dotenv(Path(__file__).parent / ".env")

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise EnvironmentError("MONGO_URI is not set in the .env file. Cannot connect to MongoDB.")

def run():
    try:
        client = MongoClient(MONGO_URI)
        db = client['workspace_db']
        coll = db['workspace_items']
        
        # Find all corrupted items
        docs = coll.find({"type": "sql"})
        count = 0
        for d in docs:
            content = d.get('content')
            if isinstance(content, dict) and 'content' in content:
                # Fix nested content!
                actual_content = content['content']
                coll.update_one(
                    {"_id": d['_id']},
                    {"$set": {"content": actual_content}}
                )
                count += 1
                
        print(f"Successfully repaired {count} corrupted SQL queries!")
    except Exception as e:
        print(f"Error repairing database: {e}")

run()

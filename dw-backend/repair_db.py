import asyncio
from pymongo import MongoClient
import sys

def run():
    try:
        client = MongoClient('mongodb+srv://atharva7115:r0gXXuBwXMFGphXj@cluster0.bw7ttuf.mongodb.net/?appName=Cluster0')
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

import asyncio
from pymongo import MongoClient
import sys

def run():
    client = MongoClient('mongodb://localhost:27017')
    db = client['dataforge']
    coll = db['workspace_items']
    docs = coll.find().sort('createdAt', -1).limit(5)
    for d in docs:
        print(f"Name: {d.get('name')}")
        print(f"Content Type: {type(d.get('content'))}")
        val = str(d.get('content'))
        print(f"Content snippet: {val[:100]}")
        print('-'*20)

run()

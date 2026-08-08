import sys
import json

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"error": "Usage: python mongodb_query.py <uri> <database> <collection> <operation> [query_json] [doc_json]"}))
        sys.exit(1)
        
    uri = sys.argv[1]
    db_name = sys.argv[2]
    collection_name = sys.argv[3]
    operation = sys.argv[4]
    
    query_str = sys.argv[5] if len(sys.argv) > 5 else "{}"
    doc_str = sys.argv[6] if len(sys.argv) > 6 else "{}"
    
    try:
        query = json.loads(query_str)
    except Exception:
        query = {}
        
    try:
        doc = json.loads(doc_str)
    except Exception:
        doc = {}

    try:
        from pymongo import MongoClient
        client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        db = client[db_name]
        col = db[collection_name]
        
        if operation == "find":
            results = list(col.find(query).limit(100))
            for r in results:
                if "_id" in r:
                    r["_id"] = str(r["_id"])
            print(json.dumps({"results": results}))
        elif operation == "insertOne":
            res = col.insert_one(doc)
            print(json.dumps({"success": True, "inserted_id": str(res.inserted_id)}))
        elif operation == "updateOne":
            res = col.update_many(query, {"$set": doc})
            print(json.dumps({"success": True, "matched_count": res.matched_count, "modified_count": res.modified_count}))
        elif operation == "deleteMany":
            res = col.delete_many(query)
            print(json.dumps({"success": True, "deleted_count": res.deleted_count}))
        else:
            print(json.dumps({"error": f"Unsupported operation: {operation}"}))
    except ImportError:
        import os
        sandbox_dir = "logs/mongodb_sandbox"
        os.makedirs(sandbox_dir, exist_ok=True)
        file_path = os.path.join(sandbox_dir, f"{collection_name}.json")
        
        data = []
        if os.path.exists(file_path):
            try:
                with open(file_path, "r") as f:
                    data = json.load(f)
            except Exception:
                data = []
                
        if operation == "find":
            print(json.dumps({"results": data[:100], "simulator": True}))
        elif operation == "insertOne":
            import uuid
            doc["_id"] = str(uuid.uuid4())
            data.append(doc)
            with open(file_path, "w") as f:
                json.dump(data, f, indent=2)
            print(json.dumps({"success": True, "inserted_id": doc["_id"], "simulator": True}))
        elif operation == "deleteMany":
            with open(file_path, "w") as f:
                json.dump([], f, indent=2)
            print(json.dumps({"success": True, "deleted_count": len(data), "simulator": True}))
        else:
            print(json.dumps({"error": "pymongo package is not installed and simulator does not support operation: " + operation}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    main()

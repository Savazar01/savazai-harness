import sys
import os
import sqlite3
import json

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python sqlite_query.py <db_path> <query>"}))
        sys.exit(1)
        
    db_path = sys.argv[1]
    query = sys.argv[2]
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query)
        
        if cursor.description:
            columns = [col[0] for col in cursor.description]
            rows = cursor.fetchall()
            results = [dict(row) for row in rows]
            print(json.dumps({"results": results}))
        else:
            conn.commit()
            print(json.dumps({"success": True, "rows_affected": cursor.rowcount}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()

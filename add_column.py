import sqlite3
import os

db_path = r'g:\My Drive\204 เล่มผลงาน\InvertOnline\instance\users.db'

# Check if file exists first (instance folder usually)
if not os.path.exists(db_path):
    # Try alternate path if not in instance
    db_path = r'g:\My Drive\204 เล่มผลงาน\InvertOnline\users.db'

print(f"Connecting to database at: {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if column exists
    cursor.execute("PRAGMA table_info(project)")
    columns = [info[1] for info in cursor.fetchall()]
    
    if 'map_data' not in columns:
        print("Adding map_data column...")
        cursor.execute("ALTER TABLE project ADD COLUMN map_data TEXT")
        conn.commit()
        print("Column map_data added successfully.")
    else:
        print("Column map_data already exists.")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")

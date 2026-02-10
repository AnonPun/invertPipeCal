import sqlite3
import os

def add_column():
    db_path = "users.db"
    status_file = "migration_status.txt"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if map_data exists first
        cursor.execute("PRAGMA table_info(project)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'map_data' not in columns:
            cursor.execute("ALTER TABLE project ADD COLUMN map_data TEXT")
            msg = "Added map_data"
        else:
            msg = "map_data already exists"
            
        if 'design_data' not in columns:
            cursor.execute("ALTER TABLE project ADD COLUMN design_data TEXT")
            msg += ", Added design_data"
        else:
            msg += ", design_data already exists"

        with open(status_file, "w") as f:
            f.write(f"SUCCESS: {msg}")

    except sqlite3.OperationalError as e:
        with open(status_file, "w") as f:
            f.write(f"ERROR: {e}")
    except Exception as e:
         with open(status_file, "w") as f:
            f.write(f"ERROR: {e}")
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    add_column()

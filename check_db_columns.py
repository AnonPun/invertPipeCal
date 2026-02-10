import sqlite3

def check_columns():
    db_path = "users.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        cursor.execute("PRAGMA table_info(project)")
        columns = [row[1] for row in cursor.fetchall()]
        print(f"Columns in 'project' table: {columns}")
        if 'map_data' in columns:
            print("Verified: 'map_data' exists.")
        else:
            print("Missing: 'map_data'.")
            
        if 'design_data' in columns:
            print("Verified: 'design_data' exists.")
        else:
             print("Missing: 'design_data'.")

    except Exception as e:
        print(f"Error checking columns: {e}")
        
    conn.close()

if __name__ == "__main__":
    check_columns()

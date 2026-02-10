import sqlite3
import os

def fix_database():
    # Get the directory where this script is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(base_dir, 'users.db')
    
    print(f"Script Directory: {base_dir}")
    print(f"Target Database: {db_path}")
    
    if not os.path.exists(db_path):
        print("ERROR: users.db not found at expected path!")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check existing columns
        cursor.execute("PRAGMA table_info(project)")
        existing_columns = [row[1] for row in cursor.fetchall()]
        print(f"Existing columns: {existing_columns}")
        
        # Add map_data if missing
        if 'map_data' not in existing_columns:
            print("Adding 'map_data' column...")
            cursor.execute("ALTER TABLE project ADD COLUMN map_data TEXT")
        else:
            print("'map_data' already exists.")
            
        # Add design_data if missing
        if 'design_data' not in existing_columns:
            print("Adding 'design_data' column...")
            cursor.execute("ALTER TABLE project ADD COLUMN design_data TEXT")
        else:
            print("'design_data' already exists.")

        conn.commit()
        conn.close()
        print("Database fix completed successfully.")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    fix_database()

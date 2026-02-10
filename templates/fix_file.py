import os
import shutil
import sys

# Unicode path handling
base = r"g:\My Drive\204 เล่มผลงาน\InvertOnline\templates"

src = os.path.join(base, "report_new.html")
dst = os.path.join(base, "report.html")

print(f"Moving {src} to {dst}")

try:
    if not os.path.exists(src):
        print(f"Source file {src} not found!")
        sys.exit(1)

    if os.path.exists(dst):
        print(f"Removing destination {dst}")
        os.remove(dst)

    print("Copying...")
    shutil.copy2(src, dst)
    print("Success")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)

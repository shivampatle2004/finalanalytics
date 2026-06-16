import os
import shutil

# Target relative directories to delete
directories_to_delete = [
    "frontend/node_modules",
    "frontend/dist",
    "Analytics-backend/venv",
    "Analytics-backend/.pytest_cache",
]

workspace_root = os.path.dirname(os.path.abspath(__file__))

print("=" * 60)
print("OneStopAnalytics Workspace Clean-up Utility")
print("=" * 60)
print(f"Workspace: {workspace_root}\n")
print("[IMPORTANT] Please ensure you have stopped all running dev servers")
print("(such as 'npm run dev' and 'uvicorn') before proceeding, or else")
print("Windows will lock the files and prevent deletion.\n")

confirm = input("Are you sure you want to delete node_modules, venv, and cache folders? (y/n): ").strip().lower()
if confirm != 'y':
    print("Cleanup cancelled.")
    exit(0)

print("\nStarting cleanup...")

# 1. Delete specified target directories
for rel_path in directories_to_delete:
    full_path = os.path.join(workspace_root, rel_path)
    if os.path.exists(full_path):
        try:
            print(f"-> Deleting: {rel_path}...")
            shutil.rmtree(full_path)
            print(f"   Successfully deleted {rel_path}")
        except Exception as e:
            print(f"   [Error] Could not delete {rel_path}: {e}")
            print("   Make sure no process/editor is using files inside this directory.")
    else:
        print(f"-> Info: {rel_path} does not exist (already clean)")

# 2. Walk and delete all __pycache__ directories
print("\n-> Searching for __pycache__ directories to delete...")
pycache_count = 0
for root, dirs, files in os.walk(workspace_root):
    # Avoid scanning node_modules or venv if deletion failed and they still exist
    if "node_modules" in dirs:
        dirs.remove("node_modules")
    if "venv" in dirs:
        dirs.remove("venv")
        
    for dir_name in dirs:
        if dir_name == "__pycache__":
            pycache_path = os.path.join(root, dir_name)
            try:
                shutil.rmtree(pycache_path)
                pycache_count += 1
            except Exception as e:
                print(f"   [Error] Could not delete {os.path.relpath(pycache_path, workspace_root)}: {e}")

print(f"-> Cleaned up {pycache_count} __pycache__ directories.")
print("\nCleanup completed! You can now safely compress and zip your project.")
print("=" * 60)

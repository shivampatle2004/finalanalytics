from sqlalchemy import text
from app.core.database import engine

def main():
    try:
        with engine.connect() as conn:
            print("Connected successfully!")
            
            # Count volumes
            volumes = conn.execute(text("SELECT * FROM public.volumes")).fetchall()
            print(f"Number of volumes: {len(volumes)}")
            for v in volumes:
                print(f" - ID: {v[0]}, Name: {v[1]}, Catalog: {v[2]}, Schema: {v[3]}")
                
            # Count volume files
            files = conn.execute(text("SELECT * FROM public.volume_files")).fetchall()
            print(f"Number of volume files: {len(files)}")
            for f in files:
                print(f" - ID: {f[0]}, VolID: {f[1]}, Filename: {f[2]}, Type: {f[3]}, Size: {f[4]}, Status: {f[5]}")
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    main()

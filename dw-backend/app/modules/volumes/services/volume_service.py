import os
import csv
import json
import uuid
import shutil
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.modules.volumes.models.volume_model import Volume, VolumeFile
from app.core.database import engine

def format_size(size_bytes: int) -> str:
    """Format bytes into human-readable strings."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"

def format_volume_file(vf: VolumeFile) -> dict:
    return {
        "id": vf.id,
        "volume_id": vf.volume_id,
        "name": vf.filename,
        "filename": vf.filename,
        "file_type": vf.file_type,
        "size_bytes": vf.size_bytes,
        "size_formatted": format_size(vf.size_bytes),
        "status": vf.status,
        "storage_path": vf.storage_path,
        "is_directory": False,
        "created_at": vf.created_at.isoformat() if vf.created_at else None,
        "updated_at": vf.created_at.strftime("%b %d, %Y, %I:%M %p") if vf.created_at else None,
        "converted_at": vf.converted_at.isoformat() if vf.converted_at else None
    }


STORAGE_DIR = os.path.join(os.getcwd(), "storage", "volumes")

def ensure_storage_exists():
    if not os.path.exists(STORAGE_DIR):
        os.makedirs(STORAGE_DIR, exist_ok=True)

def format_volume(vol: Volume) -> dict:
    """Format a Volume ORM object into a serializable dict."""
    return {
        "id": vol.id,
        "name": vol.name,
        "catalog_name": vol.catalog_name,
        "schema_name": vol.schema_name,
        "created_at": vol.created_at.isoformat() if vol.created_at else None
    }

def list_volumes(db: Session):
    """List all volume containers."""
    vols = db.query(Volume).order_by(Volume.created_at.desc()).all()
    return [format_volume(v) for v in vols]

def create_volume_container(db: Session, name: str, catalog_name: str, schema_name: str):
    """Create a new volume container."""
    # Ensure physical schema exists in PostgreSQL
    if catalog_name and schema_name:
        physical_schema = f"{catalog_name.lower()}_{schema_name.lower()}"
        db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{physical_schema}"'))
        # Create schema for the volume specifically
        volume_full_schema = f"{catalog_name.lower()}_{schema_name.lower()}_{name.lower()}"
        db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{volume_full_schema}"'))
    elif schema_name:
        db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name.lower()}"'))
        
    # Also ensure a schema with just the volume's name exists
    if name:
        db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{name.lower()}"'))

    vol = Volume(name=name, catalog_name=catalog_name, schema_name=schema_name)
    db.add(vol)
    db.commit()
    db.refresh(vol)
    return format_volume(vol)

def get_volume(db: Session, volume_id: str):
    return db.query(Volume).filter(Volume.id == volume_id).first()

def list_files_in_volume(db: Session, volume_id: str):
    return db.query(VolumeFile).filter(VolumeFile.volume_id == volume_id).all()

def create_volume_file(db: Session, volume_id: str, filename: str, file_type: str, size_bytes: int, storage_path: str):
    """Upload a file to a volume."""
    vol_file = VolumeFile(
        volume_id=volume_id,
        filename=filename,
        file_type=file_type.upper(),
        size_bytes=size_bytes,
        storage_path=storage_path,
        status="uploaded"
    )
    db.add(vol_file)
    db.commit()
    db.refresh(vol_file)
    return vol_file

def delete_volume(db: Session, volume_id: str):
    """Delete a volume container and all its files."""
    vol = get_volume(db, volume_id)
    if vol:
        files = list_files_in_volume(db, volume_id)
        for f in files:
            if os.path.exists(f.storage_path):
                os.remove(f.storage_path)
            db.delete(f)
        db.delete(vol)
        db.commit()
        return True
    return False

def convert_file_to_table(db: Session, file_id: str, catalog_name: str = None):
    """Convert an uploaded file within a volume into a Postgres table."""
    vf = db.query(VolumeFile).filter(VolumeFile.id == file_id).first()
    if not vf:
        raise ValueError("File not found")
    
    vol = get_volume(db, vf.volume_id)
    
    file_type = vf.file_type.upper()
    if file_type not in ['CSV', 'JSON']:
        raise ValueError(f"Conversion for {file_type} is not supported yet")
    
    # Target table name based on filename
    table_base_name = "".join([c if c.isalnum() else "_" for c in vf.filename.rsplit('.', 1)[0]]).lower()
    table_name = f"vl_{table_base_name}_{vf.id[:8]}"
    
    # Determine physical schema name
    if catalog_name:
        schema_name = f"{catalog_name.lower()}_bronze"
    else:
        schema_name = f"{vol.catalog_name}_{vol.schema_name}" if vol.catalog_name and vol.schema_name else (vol.schema_name or "silver")
    schema_name = schema_name.lower()

    # Ensure schema exists
    db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
    
    records = []
    headers = []

    if file_type == 'CSV':
        with open(vf.storage_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames
            if not headers:
                raise ValueError("CSV has no headers")
            records = list(reader)
    elif file_type == 'JSON':
        with open(vf.storage_path, mode='r', encoding='utf-8') as f:
            data = json.load(f)
            if not isinstance(data, list):
                if isinstance(data, dict):
                    data = [data]
                else:
                    raise ValueError("JSON must be an array of objects or a single object")
            
            if not data:
                raise ValueError("JSON file is empty")
            
            headers = list(data[0].keys())
            records = data

    clean_headers = ["".join([c if c.isalnum() else "_" for c in h]) for h in headers]
    header_map = {h: clean_headers[i] for i, h in enumerate(headers)}
    
    cols_def = ", ".join([f'"{h}" TEXT' for h in clean_headers])
    db.execute(text(f'DROP TABLE IF EXISTS "{schema_name}"."{table_name}"'))
    db.execute(text(f'CREATE TABLE "{schema_name}"."{table_name}" ({cols_def})'))
    
    rows_inserted = 0
    cols_str = ", ".join([f'"{h}"' for h in clean_headers])
    placeholders = ", ".join([f":{h}" for h in clean_headers])
    insert_query = text(f'INSERT INTO "{schema_name}"."{table_name}" ({cols_str}) VALUES ({placeholders})')

    for rec in records:
        row_data = {}
        for original_h, clean_h in header_map.items():
            val = rec.get(original_h)
            if isinstance(val, (dict, list)):
                val = json.dumps(val)
            row_data[clean_h] = val
            
        db.execute(insert_query, row_data)
        rows_inserted += 1

    vf.status = "converted"
    vf.converted_at = datetime.utcnow()
    db.commit()

    return {
        "table_name": table_name,
        "schema_name": schema_name,
        "full_path": f"{schema_name}.{table_name}",
        "rows_inserted": rows_inserted
    }


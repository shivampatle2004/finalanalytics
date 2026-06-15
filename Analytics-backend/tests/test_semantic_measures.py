import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import Base, get_db
from models import UploadedFile, FileColumn, SemanticMeasure, SemanticMeasureVersion

# Setup test SQLite database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_measures.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def db():
    Base.metadata.create_all(bind=engine)
    db_session = TestingSessionLocal()
    try:
        # Seed required records for tests
        test_file = UploadedFile(
            id="test_file",
            file_name="test_data.csv",
            file_path="test_data.csv",
            row_count=100,
            column_count=2,
            status="completed"
        )
        db_session.add(test_file)
        db_session.commit()

        col1 = FileColumn(
            file_id="test_file",
            column_name="Sales",
            data_type="numeric"
        )
        col2 = FileColumn(
            file_id="test_file",
            column_name="Cost",
            data_type="numeric"
        )
        db_session.add_all([col1, col2])
        db_session.commit()

        yield db_session
    finally:
        db_session.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="module")
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_create_measure_versioning(client, db):
    payload = {
        "name": "Profit",
        "display_name": "Gross Profit",
        "description": "Sales minus cost calculation",
        "category": "Financial",
        "expression": "[Sales] - [Cost]",
        "format": "Currency",
        "file_id": "test_file"
    }
    response = client.post("/analytics/api/modeling/measures", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Profit"
    assert data["version"] == 1
    
    # Check that a version snapshot was saved
    measure_id = data["id"]
    version_record = db.query(SemanticMeasureVersion).filter(
        SemanticMeasureVersion.measure_id == measure_id,
        SemanticMeasureVersion.version == 1
    ).first()
    assert version_record is not None
    assert version_record.expression == "[Sales] - [Cost]"
    assert version_record.display_name == "Gross Profit"
    assert version_record.format == "Currency"

def test_update_measure_versioning(client, db):
    # Retrieve the measure we just created
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.name == "Profit").first()
    assert measure is not None
    
    payload = {
        "expression": "([Sales] - [Cost]) * 1.1", # Changed expression
        "display_name": "Gross Profit Adjusted"
    }
    response = client.put(f"/analytics/api/modeling/measures/{measure.id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 2
    assert data["expression"] == "([Sales] - [Cost]) * 1.1"

    # Check database version history
    versions = db.query(SemanticMeasureVersion).filter(
        SemanticMeasureVersion.measure_id == measure.id
    ).order_by(SemanticMeasureVersion.version).all()
    assert len(versions) == 2
    assert versions[0].version == 1
    assert versions[0].expression == "[Sales] - [Cost]"
    assert versions[1].version == 2
    assert versions[1].expression == "([Sales] - [Cost]) * 1.1"
    assert versions[1].display_name == "Gross Profit Adjusted"

def test_list_measure_versions(client, db):
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.name == "Profit").first()
    assert measure is not None
    
    response = client.get(f"/analytics/api/modeling/measures/{measure.id}/versions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Sorted descending by version number
    assert data[0]["version"] == 2
    assert data[1]["version"] == 1

def test_rollback_measure_version(client, db):
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.name == "Profit").first()
    assert measure is not None
    
    # Roll back to V1
    response = client.post(f"/analytics/api/modeling/measures/{measure.id}/versions/1/rollback")
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == 3
    assert data["expression"] == "[Sales] - [Cost]"
    assert data["display_name"] == "Gross Profit"

    # Check version 3 was recorded in database
    v3 = db.query(SemanticMeasureVersion).filter(
        SemanticMeasureVersion.measure_id == measure.id,
        SemanticMeasureVersion.version == 3
    ).first()
    assert v3 is not None
    assert v3.expression == "[Sales] - [Cost]"
    assert v3.modified_by == "Rollback to V1"

def test_lineage_and_impact(client, db):
    measure = db.query(SemanticMeasure).filter(SemanticMeasure.name == "Profit").first()
    assert measure is not None
    
    # Test Lineage
    response = client.get(f"/analytics/api/modeling/measures/{measure.id}/lineage")
    assert response.status_code == 200
    lineage = response.json()
    assert lineage["measure_name"] == "Profit"
    parents = [p["name"] for p in lineage["parents"]]
    assert "Sales" in parents
    assert "Cost" in parents
    
    # Test Impact
    response = client.get(f"/analytics/api/modeling/measures/{measure.id}/impact")
    assert response.status_code == 200
    impact = response.json()
    assert impact["measure_name"] == "Profit"
    assert impact["is_critical"] is False

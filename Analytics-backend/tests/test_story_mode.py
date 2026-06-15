import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database import Base, get_db
from models import UploadedFile, Story, StoryPoint, User
from routers.stories import get_db as stories_get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_story_mode.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="module")
def db():
    Base.metadata.create_all(bind=engine)
    db_session = TestingSessionLocal()
    try:
        # Create a test user
        test_user = User(
            id=1,
            email="test@example.com",
            hashed_password="hashed_password_placeholder",
            full_name="Test User"
        )
        db_session.add(test_user)
        db_session.commit()

        # Create a test uploaded file first
        test_file = UploadedFile(
            id="test_file_stories",
            file_name="test_stories_data.csv",
            file_path="test_stories_data.csv",
            row_count=50,
            column_count=3,
            status="completed"
        )
        db_session.add(test_file)
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
    app.dependency_overrides[stories_get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_story_crud(client, db):
    # 1. Create a story
    payload = {
        "name": "Executive Story",
        "description": "A story for executive review",
        "file_id": "test_file_stories",
        "user_id": 1,
        "initial_point": {
            "title": "Welcome Point",
            "narrative": "This is the start of the executive narrative.",
            "dashboard_id": "test_file_stories",
            "filters": [{"column": "Region", "operator": "=", "value": "North"}]
        }
    }
    response = client.post("/analytics/api/stories", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Executive Story"
    assert data["point_count"] == 1
    story_id = data["id"]
    
    # 2. Get the story
    response = client.get(f"/analytics/api/stories/{story_id}")
    assert response.status_code == 200
    story_data = response.json()
    assert story_data["name"] == "Executive Story"
    assert len(story_data["points"]) == 1
    assert story_data["points"][0]["title"] == "Welcome Point"
    assert story_data["points"][0]["filters"] == [{"column": "Region", "operator": "=", "value": "North"}]
    
    # 3. Add another story point
    point_payload = {
        "title": "Second Point",
        "narrative": "Detailed breakdown by department.",
        "dashboard_id": "test_file_stories",
        "filters": [{"column": "Department", "operator": "=", "value": "HR"}]
    }
    response = client.post(f"/analytics/api/stories/{story_id}/points", json=point_payload)
    assert response.status_code == 201
    point_data = response.json()
    assert point_data["title"] == "Second Point"
    assert point_data["sort_order"] == 1
    point_id = point_data["id"]
    
    # 4. Reorder points
    reorder_payload = {
        "order": [point_id, story_data["points"][0]["id"]]
    }
    response = client.post(f"/analytics/api/stories/{story_id}/points/reorder", json=reorder_payload)
    assert response.status_code == 200
    reorder_data = response.json()
    assert reorder_data["points"][0]["id"] == point_id
    assert reorder_data["points"][1]["id"] == story_data["points"][0]["id"]
    
    # 5. Duplicate a point
    response = client.post(f"/analytics/api/stories/{story_id}/points/{point_id}/duplicate")
    assert response.status_code == 200
    dup_data = response.json()
    assert dup_data["title"] == "Second Point (Copy)"
    
    # 6. Update story metadata
    response = client.put(f"/analytics/api/stories/{story_id}", json={"name": "Executive Story Updated", "description": "New description"})
    assert response.status_code == 200
    assert response.json()["name"] == "Executive Story Updated"
    assert response.json()["description"] == "New description"
    
    # 7. Fetch presentation payload
    response = client.get(f"/analytics/api/stories/{story_id}/present")
    assert response.status_code == 200
    pres_data = response.json()
    assert pres_data["story"]["name"] == "Executive Story Updated"
    assert len(pres_data["points"]) == 3
    
    # 8. Test delete point
    response = client.delete(f"/analytics/api/stories/{story_id}/points/{point_id}")
    assert response.status_code == 200
    
    # 9. Delete story
    response = client.delete(f"/analytics/api/stories/{story_id}")
    assert response.status_code == 200
    
    # Verify deletion
    response = client.get(f"/analytics/api/stories/{story_id}")
    assert response.status_code == 404

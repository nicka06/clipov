"""
Basic tests for AI Service health endpoints
"""

import pytest
import httpx
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_root_endpoint():
    """Test the root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Clipov AI Service"
    assert data["version"] == "1.0.0"
    assert data["status"] == "running"

def test_basic_health_check():
    """Test basic health check"""
    response = client.get("/health/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Clipov AI Service"

def test_liveness_check():
    """Test liveness probe"""
    response = client.get("/health/liveness")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"

def test_models_health_check():
    """Test models health check (may not be loaded in test)"""
    response = client.get("/health/models")
    assert response.status_code == 200
    # Models may not be loaded in test environment
    # Just verify the endpoint responds

@pytest.mark.asyncio
async def test_async_health_check():
    """Test health check with async client"""
    async with httpx.AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.get("/health/")
    assert response.status_code == 200 
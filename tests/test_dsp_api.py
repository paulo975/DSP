"""
Testes básicos da API DSP.
Executar com: pytest tests/
"""
import pytest
from fastapi.testclient import TestClient
import sys
from pathlib import Path

# Adicionar backend ao path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from server import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# ---------------------------------------------------------------------------
# Estado DSP
# ---------------------------------------------------------------------------

def test_get_state_empty():
    """Estado inicial deve retornar estrutura vazia válida."""
    response = client.get("/api/state")
    assert response.status_code == 200
    data = response.json()
    assert "inputs" in data
    assert "outputs" in data
    assert "matrix" in data


def test_put_and_get_state():
    """Guardar e recuperar estado DSP."""
    state = {
        "inputs": [{"id": 0, "name": "MIC 1", "gain": -6.0, "mute": False,
                    "phase": False, "delay_ms": 0.0, "eq": [], "category": ""}],
        "outputs": [{"id": 0, "name": "MAIN L", "gain": 0.0, "mute": False,
                     "phase": False, "delay_ms": 2.0, "eq": [], "category": "full"}],
        "matrix": [[True]]
    }
    put_resp = client.put("/api/state", json=state)
    assert put_resp.status_code == 200

    get_resp = client.get("/api/state")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["inputs"][0]["name"] == "MIC 1"
    assert data["outputs"][0]["name"] == "MAIN L"
    assert data["outputs"][0]["delay_ms"] == 2.0


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------

def test_list_presets_empty():
    response = client.get("/api/presets")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_and_get_preset():
    preset = {
        "name": "Test Preset",
        "state": {"inputs": [], "outputs": [], "matrix": []}
    }
    create_resp = client.post("/api/presets", json=preset)
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["name"] == "Test Preset"
    assert "id" in created

    get_resp = client.get(f"/api/presets/{created['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == created["id"]


def test_delete_preset():
    preset = {
        "name": "Delete Me",
        "state": {"inputs": [], "outputs": [], "matrix": []}
    }
    create_resp = client.post("/api/presets", json=preset)
    preset_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/presets/{preset_id}")
    assert del_resp.status_code == 204

    get_resp = client.get(f"/api/presets/{preset_id}")
    assert get_resp.status_code == 404


def test_get_nonexistent_preset():
    response = client.get("/api/presets/nao-existe")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------

def test_create_and_get_scene():
    scene = {
        "slot": 0,
        "name": "Scene A",
        "hotkey": "F1",
        "state": {"inputs": [], "outputs": [], "matrix": []}
    }
    create_resp = client.post("/api/scenes", json=scene)
    assert create_resp.status_code == 201
    assert create_resp.json()["name"] == "Scene A"

    get_resp = client.get("/api/scenes/0")
    assert get_resp.status_code == 200
    assert get_resp.json()["slot"] == 0


def test_scene_slot_validation():
    response = client.get("/api/scenes/99")
    assert response.status_code == 400


def test_get_nonexistent_scene():
    response = client.get("/api/scenes/7")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Bridge status
# ---------------------------------------------------------------------------

def test_bridge_status_default():
    response = client.get("/api/bridge/status")
    assert response.status_code == 200
    assert response.json()["connected"] is False


def test_bridge_status_update():
    status = {"connected": True, "dsp_ip": "169.254.10.227",
               "dsp_seen": True, "last_checked": "2026-06-28T18:00:00Z"}
    post_resp = client.post("/api/bridge/status", json=status)
    assert post_resp.status_code == 200
    assert post_resp.json()["connected"] is True
    assert post_resp.json()["dsp_ip"] == "169.254.10.227"

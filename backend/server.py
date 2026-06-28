"""
DSP Audio Manager — Backend API

Fornece persistência de estado DSP (presets, canais, scenes) e
proxying opcional para o asdp_bridge quando o hardware físico está
ligado.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import json
import os
import uuid
import logging
from pathlib import Path

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).parent
DATA_DIR = ROOT_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="DSP Audio Manager API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Modelos
# ---------------------------------------------------------------------------

class ChannelState(BaseModel):
    id: int
    name: str = ""
    gain: float = 0.0          # dB
    mute: bool = False
    phase: bool = False
    delay_ms: float = 0.0
    eq: List[Dict[str, Any]] = Field(default_factory=list)  # lista de bandas PEQ
    category: str = ""         # bass / mid / high / full


class DspState(BaseModel):
    inputs: List[ChannelState] = Field(default_factory=list)
    outputs: List[ChannelState] = Field(default_factory=list)
    matrix: List[List[bool]] = Field(default_factory=list)  # [input][output]


class Preset(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    state: DspState


class Scene(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    slot: int                   # 0-7
    name: str
    hotkey: Optional[str] = None
    state: DspState


class BridgeStatus(BaseModel):
    connected: bool
    dsp_ip: str = ""
    dsp_seen: bool = False
    last_checked: str = ""


# ---------------------------------------------------------------------------
# Persistência simples em JSON (ficheiros locais)
# ---------------------------------------------------------------------------

PRESETS_FILE = DATA_DIR / "presets.json"
SCENES_FILE = DATA_DIR / "scenes.json"
STATE_FILE = DATA_DIR / "current_state.json"


def _load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return default


def _save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Rotas — estado atual do DSP
# ---------------------------------------------------------------------------

@app.get("/api/state", response_model=DspState, summary="Obter estado atual do DSP")
async def get_state():
    data = _load_json(STATE_FILE, {"inputs": [], "outputs": [], "matrix": []})
    return DspState(**data)


@app.put("/api/state", response_model=DspState, summary="Guardar estado atual do DSP")
async def put_state(state: DspState):
    _save_json(STATE_FILE, state.model_dump())
    return state


# ---------------------------------------------------------------------------
# Rotas — Presets
# ---------------------------------------------------------------------------

@app.get("/api/presets", response_model=List[Preset], summary="Listar presets")
async def list_presets():
    data = _load_json(PRESETS_FILE, [])
    return [Preset(**p) for p in data]


@app.post("/api/presets", response_model=Preset, status_code=201, summary="Criar preset")
async def create_preset(preset: Preset):
    data = _load_json(PRESETS_FILE, [])
    data.append(preset.model_dump())
    _save_json(PRESETS_FILE, data)
    logger.info("Preset criado: %s (%s)", preset.name, preset.id)
    return preset


@app.get("/api/presets/{preset_id}", response_model=Preset, summary="Obter preset por ID")
async def get_preset(preset_id: str):
    data = _load_json(PRESETS_FILE, [])
    for p in data:
        if p["id"] == preset_id:
            return Preset(**p)
    raise HTTPException(status_code=404, detail="Preset não encontrado")


@app.put("/api/presets/{preset_id}", response_model=Preset, summary="Atualizar preset")
async def update_preset(preset_id: str, updated: Preset):
    data = _load_json(PRESETS_FILE, [])
    for i, p in enumerate(data):
        if p["id"] == preset_id:
            updated.id = preset_id
            data[i] = updated.model_dump()
            _save_json(PRESETS_FILE, data)
            return updated
    raise HTTPException(status_code=404, detail="Preset não encontrado")


@app.delete("/api/presets/{preset_id}", status_code=204, summary="Eliminar preset")
async def delete_preset(preset_id: str):
    data = _load_json(PRESETS_FILE, [])
    new_data = [p for p in data if p["id"] != preset_id]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="Preset não encontrado")
    _save_json(PRESETS_FILE, new_data)


# ---------------------------------------------------------------------------
# Rotas — Scenes (memória de cenas, slots 0-7)
# ---------------------------------------------------------------------------

@app.get("/api/scenes", response_model=List[Scene], summary="Listar scenes")
async def list_scenes():
    data = _load_json(SCENES_FILE, [])
    return [Scene(**s) for s in data]


@app.post("/api/scenes", response_model=Scene, status_code=201, summary="Guardar scene")
async def create_scene(scene: Scene):
    data = _load_json(SCENES_FILE, [])
    # Substituir scene existente no mesmo slot
    data = [s for s in data if s["slot"] != scene.slot]
    data.append(scene.model_dump())
    _save_json(SCENES_FILE, data)
    logger.info("Scene guardada: slot=%d name=%s", scene.slot, scene.name)
    return scene


@app.get("/api/scenes/{slot}", response_model=Scene, summary="Obter scene por slot (0-7)")
async def get_scene(slot: int):
    if not 0 <= slot <= 7:
        raise HTTPException(status_code=400, detail="Slot deve ser 0-7")
    data = _load_json(SCENES_FILE, [])
    for s in data:
        if s["slot"] == slot:
            return Scene(**s)
    raise HTTPException(status_code=404, detail="Scene não encontrada")


@app.delete("/api/scenes/{slot}", status_code=204, summary="Eliminar scene por slot")
async def delete_scene(slot: int):
    data = _load_json(SCENES_FILE, [])
    new_data = [s for s in data if s["slot"] != slot]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="Scene não encontrada")
    _save_json(SCENES_FILE, new_data)


# ---------------------------------------------------------------------------
# Rotas — Canais individuais
# ---------------------------------------------------------------------------

@app.get("/api/channels/inputs", response_model=List[ChannelState], summary="Listar canais de input")
async def list_inputs():
    state = _load_json(STATE_FILE, {"inputs": [], "outputs": [], "matrix": []})
    return [ChannelState(**ch) for ch in state.get("inputs", [])]


@app.get("/api/channels/outputs", response_model=List[ChannelState], summary="Listar canais de output")
async def list_outputs():
    state = _load_json(STATE_FILE, {"inputs": [], "outputs": [], "matrix": []})
    return [ChannelState(**ch) for ch in state.get("outputs", [])]


@app.put("/api/channels/inputs/{channel_id}", response_model=ChannelState, summary="Atualizar canal de input")
async def update_input(channel_id: int, channel: ChannelState):
    state = _load_json(STATE_FILE, {"inputs": [], "outputs": [], "matrix": []})
    inputs = state.get("inputs", [])
    for i, ch in enumerate(inputs):
        if ch["id"] == channel_id:
            channel.id = channel_id
            inputs[i] = channel.model_dump()
            state["inputs"] = inputs
            _save_json(STATE_FILE, state)
            return channel
    raise HTTPException(status_code=404, detail="Canal não encontrado")


@app.put("/api/channels/outputs/{channel_id}", response_model=ChannelState, summary="Atualizar canal de output")
async def update_output(channel_id: int, channel: ChannelState):
    state = _load_json(STATE_FILE, {"inputs": [], "outputs": [], "matrix": []})
    outputs = state.get("outputs", [])
    for i, ch in enumerate(outputs):
        if ch["id"] == channel_id:
            channel.id = channel_id
            outputs[i] = channel.model_dump()
            state["outputs"] = outputs
            _save_json(STATE_FILE, state)
            return channel
    raise HTTPException(status_code=404, detail="Canal não encontrado")


# ---------------------------------------------------------------------------
# Rotas — Bridge status (hardware físico)
# ---------------------------------------------------------------------------

_bridge_status = BridgeStatus(connected=False)


@app.get("/api/bridge/status", response_model=BridgeStatus, summary="Estado da ligação ao hardware DSP")
async def get_bridge_status():
    return _bridge_status


@app.post("/api/bridge/status", response_model=BridgeStatus, summary="Atualizar estado da ligação (reportado pelo asdp_bridge)")
async def post_bridge_status(status: BridgeStatus):
    global _bridge_status
    _bridge_status = status
    return _bridge_status


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health", summary="Health check")
async def health():
    return {"status": "ok", "service": "DSP Audio Manager API"}

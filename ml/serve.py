"""Model service for EDF uploads in the AdaptiCare app.

Start it (inside this folder):
    python -m uvicorn serve:app --port 8000

The Node backend sends each uploaded EDF to POST /process and stores the returned JSON.
It uses the same preprocess.py and model.py as the study, with the three fold 2 models.
Every file is handled on its own: windows from second 10 onward, 5 s each, no seizure annotation.
"""
import os
import shutil
import tempfile
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

import config

KEY = os.environ.get("ML_SERVICE_KEY", "")
_state = {}
_busy = threading.Lock()  # one file at a time keeps memory use predictable


def load():
    import model as M          # needs PyTorch
    import preprocess as P     # needs MNE and SciPy
    _state.update(M=M, P=P, thr=config.thresholds(),
                  nets={L: M.load_model(str(config.HERE / ck)) for L, ck in config.CHECKPOINTS.items()})


@asynccontextmanager
async def lifespan(app):
    load()
    yield


app = FastAPI(title="AdaptiCare model service", lifespan=lifespan)


def friendly(e):
    """Turns the short errors of preprocess.py into messages a clinician can act on."""
    m = str(e)
    if m.startswith("sfreq"):
        return f"The EDF must be sampled at 256 Hz (this file: {m.split()[-1]} Hz)."
    if m.startswith("missing "):
        return f"The EDF does not contain the required channel {m.split()[-1]}. The 18 standard bipolar channels are needed."
    return m


def check_key(x_ml_key):
    if KEY and x_ml_key != KEY:
        raise HTTPException(401, "Wrong or missing service key.")


def run_edf(path, name):
    M, P, nets, thr = _state["M"], _state["P"], _state["nets"], _state["thr"]
    sig, _ = P.filter_edf(str(path))  # raises ValueError for a wrong sampling rate or a missing channel
    n = sig.shape[1] // (config.FS * config.WIN_S)
    if n < 3:
        raise ValueError("The recording is too short. At least 25 seconds after the first 10 seconds are needed.")
    starts = P.T0 + config.WIN_S * np.arange(n, dtype=float)
    W, status = P.cut_windows(sig, starts)
    ok = status == 0
    if not ok.any():
        raise ValueError("No usable windows: every window was flat or outside the recording.")
    t, X = starts[ok], W[ok]
    models = {}
    for L, net in nets.items():
        p = M.predict_windows(net, X)
        models[L] = {
            "window_start_sec": t.tolist(),
            "probability": [round(float(v), 5) for v in p],
            "alarms_sec": [float(a) for a in M.find_alarms(t.tolist(), p.tolist(), thr[L])],
            "threshold": thr[L],
        }
    return {
        "recording": {"edf": name, "duration_s": int(round(sig.shape[1] / config.FS + P.T0))},
        "settings": {"window_s": config.WIN_S, "fs": config.FS, "alarm_rule": "3 consecutive windows >= threshold, 30 min refractory"},
        "seizures_sec": [],
        "zones": None,
        "annotated": False,  # no seizure annotation, so the app does not score this recording
        "models": models,
    }


@app.get("/health")
def health(x_ml_key: str = Header(default="")):
    check_key(x_ml_key)
    return {"ok": True, "models": sorted(_state.get("nets", {}))}


@app.post("/process")
def process(file: UploadFile = File(...), patient: str = Form(""), x_ml_key: str = Header(default="")):
    check_key(x_ml_key)
    name = Path(file.filename or "upload.edf").name
    if not name.lower().endswith(".edf"):
        raise HTTPException(422, "Only .edf files are accepted.")
    with _busy, tempfile.TemporaryDirectory() as d:
        path = Path(d) / name
        with open(path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        try:
            return run_edf(path, name)
        except ValueError as e:
            raise HTTPException(422, friendly(e))
        except Exception as e:
            raise HTTPException(422, f"Could not process this file: {e}")
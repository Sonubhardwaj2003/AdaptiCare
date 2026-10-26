"""Settings for the fold 2 prediction pipeline. The preprocessing itself lives in preprocess.py
(your friend's exact training code) and is not repeated here."""
from pathlib import Path

import pandas as pd # pyright: ignore[reportMissingModuleSource]

HERE = Path(__file__).resolve().parent

FOLD = 2
SEED = 2026
# Subjects held out as the TEST set of fold 2 (SUBJ_xx = chbXX). Anything else was used in training.
TEST_SUBJECTS = ["SUBJ_02", "SUBJ_06", "SUBJ_10"]

DATA_DIR = HERE / "data"                                            # CHB-MIT folders go here
WINDOW_TABLE = HERE / "reference" / "window_table_fold2_test.csv"   # which windows were scored
ALARM_TIMES = HERE / "reference" / "fold2_alarm_times.csv"          # frozen alarms, for verification
THRESHOLDS = HERE / "reference" / "thresholds.csv"

WIN_S = 5
FS = 128

# Label minutes -> checkpoint file. Thresholds are read from reference/thresholds.csv (full precision).
CHECKPOINTS = {"15": "models/fold2_L15.pt", "30": "models/fold2_L30.pt", "60": "models/fold2_L60.pt"}

# Frozen results from the ML teammate (fold 2, seed 2026), used only by verify_pipeline.py.
FROZEN_PR_AUC = {
    "15": {"SUBJ_02": 0.0288, "SUBJ_06": 0.0635, "SUBJ_10": 0.0489},
    "30": {"SUBJ_02": 0.0574, "SUBJ_06": 0.0709, "SUBJ_10": 0.0558},
    "60": {"SUBJ_02": 0.0634, "SUBJ_06": 0.0618, "SUBJ_10": 0.0416},
}
# (hits, seizures, false alarms) per model and subject
FROZEN_EVENTS = {
    "15": {"SUBJ_02": (1, 1, 7), "SUBJ_06": (6, 6, 86), "SUBJ_10": (2, 2, 30)},
    "30": {"SUBJ_02": (1, 1, 21), "SUBJ_06": (1, 6, 22), "SUBJ_10": (0, 2, 0)},
    "60": {"SUBJ_02": (1, 1, 11), "SUBJ_06": (4, 6, 74), "SUBJ_10": (2, 2, 20)},
}


def thresholds():
    """{"15": 0.4112..., "30": 0.6846..., "60": 0.1514...} for FOLD, from reference/thresholds.csv."""
    t = pd.read_csv(THRESHOLDS)
    t = t[t["fold"] == FOLD]
    return {str(int(r.L)): float(r.thr) for r in t.itertuples()}

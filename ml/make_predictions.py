"""Runs the trained models on CHB-MIT EDF files and writes one AdaptiCare JSON file per recording.

Usage (from this folder):
    python make_predictions.py --data "D:/chb-mit" [--subjects chb05 chb09] [--out ../ml_output] [--limit 3]

--data   folder that contains chb01, chb02 ... (each with its EDF files and chbXX-summary.txt)
--out    where the JSON files go (default: ml_output next to backend and frontend)
--limit  only process the first N files per subject, for a quick test
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np

import config

HERE = Path(__file__).resolve().parent


def parse_summary(path):
    """Reads chbXX-summary.txt. Returns {edf_name: [(start_s, end_s), ...]}."""
    out, cur = {}, None
    for line in Path(path).read_text(errors="ignore").splitlines():
        m = re.match(r"\s*File Name:\s*(\S+)", line, re.I)
        if m:
            cur = m.group(1)
            out[cur] = {"starts": [], "ends": []}
            continue
        if cur is None:
            continue
        m = re.match(r"\s*Seizure(?:\s*\d+)?\s*Start Time:\s*(\d+)", line, re.I)
        if m:
            out[cur]["starts"].append(int(m.group(1)))
            continue
        m = re.match(r"\s*Seizure(?:\s*\d+)?\s*End Time:\s*(\d+)", line, re.I)
        if m:
            out[cur]["ends"].append(int(m.group(1)))
    return {k: list(zip(v["starts"], v["ends"])) for k, v in out.items()}


def load_edf(path):
    """EDF -> array (18, samples) at config.FS, channels in config.CHANNELS order."""
    import mne  # imported here so the rest of the script can be tested without MNE

    raw = mne.io.read_raw_edf(str(path), preload=True, verbose="ERROR")
    names = {n.upper(): n for n in raw.ch_names}
    pick = []
    for ch in config.CHANNELS:
        n = names.get(ch) or names.get(ch + "-0")  # some files repeat a channel as "-0" and "-1"
        if n is None:
            raise ValueError(f"channel {ch} not found")
        pick.append(n)
    raw.pick(pick)
    raw.reorder_channels(pick)
    if config.BANDPASS:
        raw.filter(config.BANDPASS[0], config.BANDPASS[1], verbose="ERROR")
    if int(round(raw.info["sfreq"])) != config.FS:
        raw.resample(config.FS, verbose="ERROR")
    return raw.get_data()


def make_windows(data, fs=config.FS, win_s=config.WIN_S):
    """(channels, samples) -> (n, channels, fs*win_s), every window z-scored per channel."""
    size = fs * win_s
    n = data.shape[1] // size
    x = data[:, : n * size].reshape(data.shape[0], n, size).transpose(1, 0, 2).astype(np.float32)
    mu = x.mean(axis=2, keepdims=True)
    sd = x.std(axis=2, keepdims=True)
    return (x - mu) / (sd + 1e-8)


def build_payload(edf, subject, duration_s, seizures, per_model):
    """per_model: {"30": {"window_start_sec": [...], "probability": [...], "alarms_sec": [...], "threshold": 0.68}}"""
    onset = seizures[0][0] if seizures else None
    return {
        "recording": {"edf": edf, "duration_s": duration_s, "subject": subject, "fold": config.FOLD},
        "settings": {"window_s": config.WIN_S, "fs": config.FS,
                     "alarm_rule": "3 consecutive windows >= threshold, 30 min refractory"},
        "seizures_sec": [{"start": a, "end": b} for a, b in seizures],
        # Zones follow the study design: 5 min warning delay, 30 min scored window, then an unscored gap.
        "zones": None if onset is None else {
            "sph_s": [onset - 300, onset],
            "sop_s": [onset - 2100, onset - 300],
            "unscored_s": [onset - 3900, onset - 2100],
        },
        "models": per_model,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default=str(HERE.parent / "ml_output"))
    ap.add_argument("--subjects", nargs="*")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    if not config.PREPROCESSING_CONFIRMED:
        sys.exit("Stopped: open config.py, confirm the CONFIRM items with your friend, then set PREPROCESSING_CONFIRMED = True.")
    if not config.TEST_SUBJECTS:
        sys.exit(f"Stopped: fill config.TEST_SUBJECTS with the subjects held out in fold {config.FOLD}.")
    subjects = args.subjects or config.TEST_SUBJECTS
    leaked = [s for s in subjects if s not in config.TEST_SUBJECTS]
    if leaked:
        sys.exit(f"Stopped: {leaked} are not test subjects of fold {config.FOLD}. Using them would leak training data.")

    import model as M  # needs PyTorch

    nets = {L: (M.load_model(str(HERE / ck)), thr) for L, (ck, thr) in config.MODELS.items()}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    ok = failed = 0

    for subj in subjects:
        folder = Path(args.data) / subj
        summary = next(folder.glob("*-summary.txt"), None)
        if not summary:
            print(f"SKIPPED {subj}: no summary.txt in {folder}")
            continue
        seizures = parse_summary(summary)
        files = sorted(folder.glob("*.edf"))[: args.limit]
        for f in files:
            try:
                x = make_windows(load_edf(f))
                times = (np.arange(len(x)) * config.WIN_S).tolist()
                per_model = {}
                for L, (net, thr) in nets.items():
                    probs = M.predict_windows(net, x)
                    per_model[L] = {
                        "window_start_sec": times,
                        "probability": [round(float(p), 4) for p in probs],
                        "alarms_sec": [float(a) for a in M.find_alarms(times, probs.tolist(), thr)],
                        "threshold": thr,
                    }
                payload = build_payload(f.name, subj.upper(), len(x) * config.WIN_S, seizures.get(f.name, []), per_model)
                (out / f"{subj}_{f.stem}.json").write_text(json.dumps(payload))
                print(f"OK      {f.name}: {len(x)} windows, alarms " + ", ".join(f"{L}min={len(m['alarms_sec'])}" for L, m in per_model.items()))
                ok += 1
            except Exception as e:  # keep going with the next file
                print(f"FAILED  {f.name}: {e}")
                failed += 1
    print(f"Done. {ok} written to {out}, {failed} failed.")


if __name__ == "__main__":
    main()

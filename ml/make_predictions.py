"""Runs the trained fold 2 models on the CHB-MIT test subjects and writes one AdaptiCare JSON file per recording.

It follows the study exactly:
  * preprocessing = preprocess.py (training code, unchanged)
  * windows       = the rows of reference/window_table_fold2_test.csv (the windows that were scored)
  * alarms        = model.find_alarms over the whole subject timeline (so the 30 min refractory period
                    carries across file boundaries), then mapped back to each recording.

Usage (from this folder):
    python make_predictions.py                       all test subjects, all files
    python make_predictions.py --subjects SUBJ_02    one subject
    python make_predictions.py --limit 2             first 2 files per subject (quick test, not verifiable)
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd # pyright: ignore[reportMissingModuleSource]

import config

LABELS = ("15", "30", "60")


def parse_summary(path):
    """chbXX-summary.txt -> {edf_name: [(start_s, end_s), ...]} in file time."""
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


def onsets_from_table(rows):
    """Seizure onsets (subject clock, seconds) that the study scored. seizure_id looks like chb06_195607."""
    ids = rows["seizure_id"].dropna().unique()
    return sorted(float(re.search(r"_(\d+)$", s).group(1)) for s in ids)


def next_onset_lead(onsets, t_abs):
    """Seconds from t_abs to the next seizure onset, or None."""
    for o in onsets:
        if o > t_abs:
            return float(o - t_abs)
    return None


def build_payload(subject, e, seizures, per_model, zones):
    return {
        "recording": {"edf": e["edf"], "duration_s": e["duration"], "subject": subject,
                      "fold": config.FOLD, "abs_offset_s": e["offset"]},
        "settings": {"window_s": config.WIN_S, "fs": config.FS,
                     "alarm_rule": "3 consecutive windows >= threshold, 30 min refractory"},
        "seizures_sec": [{"start": a, "end": b} for a, b in seizures],
        "zones": zones,
        "labels": {L: [int(v) for v in e["labels"][L]] for L in LABELS},
        "models": per_model,
    }


def zones_for(onset):
    # Study design: 5 min warning delay, 30 min scored window, then an unscored gap up to 65 min.
    return {"sph_s": [onset - 300, onset], "sop_s": [onset - 2100, onset - 300], "unscored_s": [onset - 3900, onset - 2100]}


def process_subject(subject, rows, nets, thr, M, P, data_dir, out_dir, limit=None, allow_missing=False, log=print):
    """Returns (written, problems)."""
    patient = rows["patient"].iloc[0]
    folder = Path(data_dir) / patient
    summary_path = next(folder.glob("*-summary.txt"), None) if folder.exists() else None
    if summary_path is None:
        raise FileNotFoundError(f"{subject}: folder {folder} or its {patient}-summary.txt is missing")
    summary = parse_summary(summary_path)
    onsets = onsets_from_table(rows)

    edfs = list(dict.fromkeys(rows["edf_name"]))
    if limit:
        edfs = edfs[:limit]
    missing = [f for f in edfs if not (folder / f).exists()]
    if missing and not allow_missing:
        raise FileNotFoundError(f"{subject}: {len(missing)} EDF file(s) missing in {folder}, for example {missing[:3]}. "
                                "Alarms need the complete timeline. Download them or use --allow-missing.")
    edfs = [f for f in edfs if f not in missing]

    # Pass 1: windows -> probabilities, one EDF at a time (keeps memory small).
    per = []
    for edf in edfs:
        r = rows[rows["edf_name"] == edf]
        starts = r["win_start_in_file_s"].to_numpy(float)
        try:
            sig, _ = P.filter_edf(str(folder / edf))
        except Exception as e:  # keep the file name in the message
            raise RuntimeError(f"{edf}: {e}") from e
        W, status = P.cut_windows(sig, starts)
        ok = status == 0
        probs = {L: (M.predict_windows(net, W[ok]) if ok.any() else np.zeros(0)) for L, net in nets.items()}
        per.append({
            "edf": edf, "t_file": starts[ok], "t_abs": r["abs_start_s"].to_numpy(float)[ok],
            "offset": float((r["abs_start_s"] - r["win_start_in_file_s"]).iloc[0]),
            "duration": int(round(sig.shape[1] / config.FS + P.T0)),
            "labels": {L: r[f"label{L}"].to_numpy(int)[ok] for L in LABELS},
            "probs": probs, "alarms": {L: [] for L in nets}, "leads": {L: [] for L in nets},
        })
        log(f"  {edf}: {int(ok.sum())}/{len(starts)} windows scored" + ("" if ok.all() else f" ({int((~ok).sum())} dropped as flat or out of range)"))
        del W, sig

    # Pass 2: alarms over the whole subject timeline, then map each alarm back to its recording.
    t_abs = np.concatenate([e["t_abs"] for e in per])
    t_file = np.concatenate([e["t_file"] for e in per])
    owner = np.concatenate([np.full(len(e["t_abs"]), i) for i, e in enumerate(per)])
    for L in nets:
        p = np.concatenate([e["probs"][L] for e in per])
        for a in M.find_alarms(t_abs.tolist(), p.tolist(), thr[L]):
            j = int(np.argmin(np.abs(t_abs - (a - config.WIN_S))))
            e = per[owner[j]]
            e["alarms"][L].append(float(t_file[j] + config.WIN_S))
            e["leads"][L].append(next_onset_lead(onsets, a))

    # Write one JSON per recording.
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    problems = []
    for e in per:
        scored = []
        for s, t in summary.get(e["edf"], []):
            if any(abs(e["offset"] + s - o) <= 1.0 for o in onsets):
                scored.append((s, t))
            else:
                log(f"  note: {e['edf']} has a seizure at {s}s that the study did not score; it is left out")
        per_model = {L: {"window_start_sec": e["t_file"].tolist(),
                         "probability": [round(float(v), 5) for v in e["probs"][L]],
                         "alarms_sec": e["alarms"][L], "alarm_leads_s": e["leads"][L], "threshold": thr[L]} for L in nets}
        payload = build_payload(subject, e, scored, per_model, zones_for(scored[0][0]) if scored else None)
        (out_dir / f"{Path(e['edf']).stem}.json").write_text(json.dumps(payload))
    log(f"{subject}: wrote {len(per)} files, alarms " + ", ".join(f"{L} min={sum(len(e['alarms'][L]) for e in per)}" for L in nets))
    return len(per), problems


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(config.DATA_DIR))
    ap.add_argument("--out", default=str(config.HERE.parent / "ml_output"))
    ap.add_argument("--subjects", nargs="*")
    ap.add_argument("--limit", type=int, help="only the first N files per subject (quick test)")
    ap.add_argument("--allow-missing", action="store_true", help="skip EDF files that are not downloaded (alarms may differ)")
    args = ap.parse_args(argv)

    subjects = args.subjects or config.TEST_SUBJECTS
    leaked = [s for s in subjects if s not in config.TEST_SUBJECTS]
    if leaked:
        sys.exit(f"Stopped: {leaked} are not test subjects of fold {config.FOLD}. Using them would leak training data.")

    import model as M          # needs PyTorch
    import preprocess as P     # needs MNE and SciPy

    thr = config.thresholds()
    nets = {L: M.load_model(str(config.HERE / ck)) for L, ck in config.CHECKPOINTS.items()}
    wt = pd.read_csv(config.WINDOW_TABLE, low_memory=False)
    done = 0
    for subj in subjects:
        print(f"{subj}:")
        try:
            n, _ = process_subject(subj, wt[wt["subject"] == subj], nets, thr, M, P, args.data, args.out, args.limit, args.allow_missing)
            done += n
        except (FileNotFoundError, RuntimeError) as e:
            print(f"STOPPED  {subj}: {e}")
    print(f"Done. {done} recordings written to {args.out}")


if __name__ == "__main__":
    main()

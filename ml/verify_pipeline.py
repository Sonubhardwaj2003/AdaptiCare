"""Compares the generated JSON files with the frozen results from the ML teammate.

Run after make_predictions.py (all files, no --limit):
    python verify_pipeline.py
Checks: (1) alarm times, (2) window PR-AUC per subject, (3) hits and false alarms per subject.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd # pyright: ignore[reportMissingModuleSource]

import config


def average_precision(scores, labels):
    scores, labels = np.asarray(scores, float), np.asarray(labels, int)
    P = labels.sum()
    if P == 0 or P == len(labels):
        return None
    order = np.argsort(-scores, kind="stable")
    s, y = scores[order], labels[order]
    tp = fp = 0
    prev, ap, i = 0.0, 0.0, 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        tp += int(y[i:j].sum())
        fp += int((1 - y[i:j]).sum())
        rec = tp / P
        ap += (rec - prev) * tp / (tp + fp)
        prev, i = rec, j
    return ap


def load(out_dir):
    by = {}
    for f in sorted(Path(out_dir).glob("*.json")):
        p = json.loads(f.read_text())
        by.setdefault(p["recording"]["subject"], []).append(p)
    return by


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(config.HERE.parent / "ml_output"))
    args = ap.parse_args()
    by = load(args.out)
    if not by:
        raise SystemExit(f"No JSON files in {args.out}. Run make_predictions.py first.")
    ok_all = True

    print("\n1) Alarm times vs reference/fold2_alarm_times.csv (tolerance 5.5 s)")
    ref = pd.read_csv(config.ALARM_TIMES)
    for L in ("15", "30", "60"):
        for subj, recs in by.items():
            mine = np.array(sorted(r["recording"]["abs_offset_s"] + t for r in recs for t in r["models"][L]["alarms_sec"]))
            theirs = np.array(sorted(ref[(ref["L"] == int(L)) & (ref["subject"] == subj)]["alarm_t"]))
            hit = sum(bool(len(mine)) and np.abs(mine - t).min() <= 5.5 for t in theirs)
            extra = sum(bool(len(theirs)) and np.abs(theirs - t).min() > 5.5 for t in mine) if len(theirs) else len(mine)
            good = hit == len(theirs) and extra == 0
            ok_all &= good
            print(f"   L{L} {subj}: reference {len(theirs)}, ours {len(mine)}, matched {hit}, extra {extra}  {'OK' if good else 'CHECK'}")

    print("\n2) Window PR-AUC on the test target [T-35 min, T-5 min) vs frozen values (tolerance 0.002)")
    for L in ("15", "30", "60"):
        for subj, recs in by.items():
            lab = np.concatenate([r["labels"]["30"] for r in recs])
            sc = np.concatenate([r["models"][L]["probability"] for r in recs])
            keep = lab >= 0
            v = average_precision(sc[keep], lab[keep])
            frozen = config.FROZEN_PR_AUC[L].get(subj)
            good = v is not None and frozen is not None and abs(v - frozen) <= 0.002
            ok_all &= good
            print(f"   L{L} {subj}: ours {v:.4f}  frozen {frozen}  {'OK' if good else 'CHECK'}")

    print("\n3) Events (hit = alarm 5 to 35 min before onset; 35 to 65 min = unscored; other alarms = false alarm)")
    for L in ("15", "30", "60"):
        for subj, recs in by.items():
            seizures = sum(len(r["seizures_sec"]) for r in recs)
            hits, fa = set(), 0
            for r in recs:
                m = r["models"][L]
                for t, lead in zip(m["alarms_sec"], m["alarm_leads_s"]):
                    if lead is not None and 300 <= lead <= 2100:
                        hits.add(round(r["recording"]["abs_offset_s"] + t + lead))
                    elif lead is None or lead > 3900 or lead < 300:
                        fa += 1
            hours = sum(int((np.array(r["labels"]["30"]) == 0).sum()) for r in recs) * config.WIN_S / 3600
            fh, fs, ffa = config.FROZEN_EVENTS[L].get(subj, (None, None, None))
            good = (len(hits), seizures, fa) == (fh, fs, ffa)
            ok_all &= good
            print(f"   L{L} {subj}: hits {len(hits)}/{seizures}, FA {fa}, interictal {hours:.1f} h   frozen {fh}/{fs}, FA {ffa}  {'OK' if good else 'CHECK'}")

    print("\nRESULT:", "everything matches the frozen results." if ok_all else "some lines say CHECK. See README, section 'If a line says CHECK'.")


if __name__ == "__main__":
    main()

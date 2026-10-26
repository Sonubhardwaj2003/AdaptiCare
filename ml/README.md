# ML folder (fold 2)

Turns CHB-MIT EDF files into the JSON files that the AdaptiCare app imports.

```
EDF files -> make_predictions.py -> ../ml_output/*.json -> verify_pipeline.py -> npm run import -> AdaptiCare
```

## What is in this folder

| Path | Purpose |
|---|---|
| `preprocess.py` | Training preprocessing from the ML teammate. Do not edit. |
| `model.py` | Network, prediction and alarm rule from the ML teammate. Do not edit. |
| `models/fold2_L15.pt`, `fold2_L30.pt`, `fold2_L60.pt` | The three trained models of fold 2 (seed 2026). |
| `reference/` | `window_table_fold2_test.csv` (the windows that were scored), `thresholds.csv`, `fold2_alarm_times.csv` (frozen alarms). |
| `config.py` | Fold, test subjects, paths, frozen numbers used for verification. |
| `make_predictions.py` | Runs the models and writes one JSON per recording. |
| `verify_pipeline.py` | Compares the output with the frozen results. |
| `data/` | Put the downloaded CHB-MIT files here (see `data/README.txt`). |

## Rules

* Only SUBJ_02, SUBJ_06 and SUBJ_10 (chb02, chb06, chb10) may be used. They are the test subjects of fold 2. The script refuses any other subject.
* The windows come from the window table, so the output matches the frozen study exactly.
* Alarms are computed over the whole subject timeline, so the 30 minute refractory period carries across file boundaries.
* Thresholds come from `reference/thresholds.csv` (full precision).

## Commands (run inside this folder)

```
pip install -r requirements.txt
python make_predictions.py --subjects SUBJ_02 --limit 2     quick test, 2 files
python make_predictions.py                                  everything (68 files)
python verify_pipeline.py                                   compare with the frozen results
```

`--allow-missing` skips EDF files that are not downloaded. Do not use it for the final run, because alarms need the complete timeline.

## If a line says CHECK

1. Run without `--limit`. A partial run can never match.
2. Check that all 68 EDF files are present and not corrupted (compare file sizes with PhysioNet).
3. Check that `models/fold2_L15.pt`, `fold2_L30.pt` and `fold2_L60.pt` are the right files for their names.
4. Check the MNE version (`pip show mne`). Send the full verify output to your ML teammate; small differences in EDF reading can move a few windows.

# AdaptiCare ML folder

Turns CHB-MIT EEG files into the JSON files that the AdaptiCare app imports.

```
EDF files  ->  make_predictions.py  ->  ../ml_output/*.json  ->  npm run import  ->  AdaptiCare
```

## Files

| File | Purpose |
|---|---|
| `model.py` | Your friend's network, prediction and alarm rule. Do not edit. |
| `fold2_L30.pt` | Trained model: fold 2, 30 minute label. |
| `config.py` | Fold, test subjects, channels, filter, model list. Must be confirmed with your friend. |
| `make_predictions.py` | Reads EDF files, runs the models, writes one JSON per recording. |
| `requirements.txt` | Python packages. |

## One-time setup

1. Install Python 3.10 or newer.
2. In this folder: `pip install -r requirements.txt`
3. Check the model loads: `python -c "from model import load_model; load_model('fold2_L30.pt'); print('ok')"`

## Before the first real run

Open `config.py` and confirm with your friend:

1. `TEST_SUBJECTS`: the subjects held out as the test set of fold 2.
2. `CHANNELS`: the 18 channels and their order used in training.
3. `BANDPASS`: the filter used in training (or None).
4. The windows are z-scored per channel (as in `model.py`), 128 Hz, 5 s.

Then set `PREPROCESSING_CONFIRMED = True`. The script refuses to run until you do, and it refuses subjects that are not test subjects of the fold (this prevents training leakage).

## Run

```
python make_predictions.py --data "D:/chb-mit" --limit 2        quick test on 2 files per subject
python make_predictions.py --data "D:/chb-mit"                  all files of the test subjects
```

`--data` is the folder that contains `chb01`, `chb02` and so on. Each subject folder must contain its EDF files and its `chbXX-summary.txt`.
Include recordings without seizures too: the Statistics page needs them as negative examples.

## Load into the app

From the `backend` folder:

```
npm run import -- ../ml_output --reset-demo
```

`--reset-demo` removes the fake demo data. Use `--overwrite` to replace recordings that were imported before.

## Adding the 15 and 60 minute models

Put the checkpoint files in this folder, then add them to `MODELS` in `config.py` with their thresholds. Run again with `--overwrite` on import. The app shows only the models that exist in a recording, and the comparison pages (Results, Statistics) fill in as more models arrive.

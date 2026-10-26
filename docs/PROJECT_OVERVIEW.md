# AdaptiCare: project overview

A plain explanation of what the project studies, what the app does, what is measured, and how ready the work is for a paper. Use it for your guide meeting and for the viva.

## 1. The research question

When a seizure prediction model is trained, windows shortly before a seizure are labelled "preictal" (positive). How long that preictal period is (15, 30 or 60 minutes) is a choice. Earlier work found that the length matters when a model is trained per patient. This study asks whether the effect also appears when the model is tested on patients it has never seen (patient-independent evaluation), on the CHB-MIT scalp EEG database.

Only the label length changes. The model, the subject splits, the 1:4 positive-to-negative training ratio and the test target stay fixed. Safe wording for the paper: *a controlled test of whether the preictal-length effect seen in subject-specific work holds under patient-independent evaluation.* Do not call it "first" or "novel".

## 2. The study design in short

| Item | Value |
|---|---|
| Data | CHB-MIT, 5 s windows, 128 Hz, 18 bipolar channels, band-pass 1 to 30 Hz, z-score per window and channel |
| Model | small 1D CNN with a bidirectional LSTM, trained from scratch |
| Label lengths | 15, 30, 60 minutes, placed 5 minutes before onset |
| Splits | subjects are grouped into 5 folds; each fold has test subjects, one validation subject and training subjects (patients never overlap) |
| Test target | windows from 35 to 5 minutes before onset, the same for all three models |
| Alarm rule | 3 consecutive windows above the threshold, then 30 minutes of silence |
| Threshold | chosen on the validation subject for a false-alarm budget of 0.2 per hour |
| Models in total | 5 folds x 3 label lengths = 15 |

## 3. What is measured

* **Window PR-AUC per subject** (threshold free). It is compared with prevalence, the score of a random guess.
* **Event level:** how many seizures got an alarm 5 to 35 minutes before onset, and false alarms per interictal hour. These two are always shown together.
* **Statistics across subjects:** Friedman test over the three label lengths, with post-hoc tests planned. With few subjects the results are exploratory.
* **Trained on X, scored against Y:** a 3 x 3 table that separates the effect of the label from the effect of the test target.

## 4. What the app does, and what it does not do

```
Research side (ML teammate)            Bridge (ml/ folder)                 App
training, thresholds, frozen results   replays the saved models on the     shows risk over time,
                                       test recordings, writes JSON         alarms, results
```

* The app **displays** results. It does not train, tune or change any model, threshold or split. It cannot change the research numbers.
* `ml/make_predictions.py` runs the teammate's own `preprocess.py` and `model.py` on the test recordings of fold 2. `ml/verify_pipeline.py` then checks that alarms, PR-AUC and hits match the teammate's frozen results. If they do not match, the frozen numbers are the reference and the bridge must be fixed.
* The Statistics page shows the frozen results first. The numbers it computes itself are a cross-check and are exploratory. Numbers for the paper come from the research pipeline, not from the app.
* The app is a demo of the research. Whether it belongs in the paper is for your guide to decide.

## 5. Where the results stand (fold 2 only)

Test subjects SUBJ_02, SUBJ_06, SUBJ_10: 9 seizures in total.

| Model | Seizures detected | False alarms per hour |
|---|---|---|
| 15 min | 9 of 9 | 1.17 |
| 30 min | 2 of 9 | 0.41 |
| 60 min | 7 of 9 | 1.00 |

Window PR-AUC lies between roughly 1 and 3.6 times prevalence, and the 60 minute model on SUBJ_06 is below prevalence. Honest reading:

* The models show weak ability to separate the 30 minutes before a seizure from normal EEG on unseen patients. This is common in patient-independent work and can be reported as it is.
* The thresholds did not transfer: 0.2 false alarms per hour on validation became 0.4 to 1.2 on test. The hit counts therefore cannot be compared across label lengths. The 15 minute model's 9 of 9 is not evidence that it is better.
* One fold and 9 seizures cannot support a conclusion about label length. The other four folds are needed.

## 6. Can this become a paper?

A paper is possible if the study is completed and reported honestly. A clear weak or null result with a rigorous protocol is acceptable for a B.Tech level paper, a student conference or a workshop. A claim that "longer labels are better" is not supported by the data you have now.

What is still needed:

1. All 5 folds and all 15 models, with the same protocol and no changes to defaults after seeing test results.
2. Per-subject PR-AUC with prevalence, event-level sensitivity and false alarms per hour for every fold.
3. Statistical comparison across subjects (Friedman and post-hoc tests with correction) and confidence intervals, for example by bootstrapping subjects. State clearly that the sample is small.
4. At least one control that shows the pipeline works, such as a run with shuffled labels that should land near prevalence.
5. A fair comparison of events: report the false alarms per hour of every model on the test subjects, or compare at a matched false-alarm rate, because the validation threshold did not transfer.
6. A literature review in which every citation was checked against the paper itself.
7. Your guide's approval for the app, the model and the splits that are still defaults.

## 7. Questions to confirm with the ML teammate

1. Are all test subjects absent from training and from validation in every fold (including chb01 and chb21 together as SUBJ_01)?
2. Was anything (normalisation, early stopping, threshold) fitted on test data? Early stopping and the threshold used the validation subject only, correct?
3. Are the same model code and preprocessing used for all 15 models?
4. Is there a shuffled-label or random-score control?
5. How many seeds? One seed is acceptable if stated.
6. Can you provide models, window tables and thresholds for folds 1, 3, 4 and 5 in the same format as fold 2?

## 8. Short viva answers

* **What does the project do?** It tests how the preictal label length changes seizure prediction on unseen patients, and shows the results in a dashboard.
* **Why patient-independent?** A real system must work on a new patient without training on that patient's seizures.
* **Why PR-AUC?** Seizure windows are rare, and PR-AUC is not distorted by that. It is compared with prevalence.
* **Why the app?** It makes the effect visible: the same recording scored by three models side by side, with alarms and warning times.
* **Does the app change the results?** No. It only displays saved model output, and a script checks it against the research results.
* **Is it a medical tool?** No. It is a research prototype.

# AdaptiCare

A dashboard for studying how the length of the preictal training label (15, 30 or 60 minutes) affects patient-independent EEG seizure prediction on the CHB-MIT database. Clinicians review recordings, replay predicted risk, and handle alarms. The Statistics page shows the frozen results of the ML team next to the same analysis computed from the data inside the app.

AdaptiCare is a research prototype. It is not a clinical or diagnostic tool.

## How it fits together

```
CHB-MIT EDF files
      |  ml/make_predictions.py   (Python, PyTorch, MNE: runs on your computer)
      v
ml_output/*.json                  one file per recording, format in section 5
      |  npm run import           (validates every file)
      v
MongoDB Atlas  <---  Node/Express API  <---  React web app (Tailwind CSS)
```

The server never runs the model. This keeps deployment small: Render only hosts the API and the web app (see `docs/DEPLOY_RENDER.md`).

For an explanation of the research question, what is measured and how ready the work is for a paper, read `docs/PROJECT_OVERVIEW.md` first.

## 1. Features

* Sign-in with roles. Admins create users, change roles, disable accounts and reset passwords. Clinicians only see patients assigned to them.
* Profile page with photo, name, password change and sign out.
* Recording viewer: risk-over-time chart for the 15, 30 and 60 minute models, replay mode, alarm list with the time to the next seizure.
* Alarm inbox: acknowledge or dismiss.
* Results: per-model detection, false alarms per interictal hour, lead time.
* Statistics: frozen fold 2 results (events and PR-AUC with prevalence), live per-subject PR-AUC, Friedman test and the "trained on vs scored against" table.
* Import tool with validation, and an admin script to create the first admin.

## 2. Tech stack

React 18, Vite, React Router, Tailwind CSS. Node.js, Express, Mongoose, MongoDB, JSON Web Tokens, bcryptjs. Python 3 with PyTorch, MNE, SciPy, pandas for the ML pipeline.

## 3. Project structure

```
AdaptiCare/
  backend/
    src/            server.js, routes.js, models.js, auth.js, ingest.js, stats.js, seed.js, mockgen.js
    scripts/        import-predictions.js, create-admin.js
    data/           frozen_fold2.json (reference results from the ML team)
  frontend/
    src/            App.jsx, pages.jsx, Profile.jsx, Chart.jsx, ui.jsx, api.jsx
    tailwind.config.js
  ml/               preprocess.py, model.py, models/, reference/, make_predictions.py, verify_pipeline.py
  docs/             PROJECT_OVERVIEW.md (what the project studies, status, paper readiness), DEPLOY_RENDER.md
  sample_data/      mock_prediction.json (fake demo data format)
  render.yaml       optional Render Blueprint
  INSTRUCTIONS.md   step-by-step guide from start to deployment
```

## 4. API

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /api/auth/login | public | sign in |
| GET, PATCH | /api/auth/me | signed in | own profile, change name or photo |
| POST | /api/auth/password | signed in | change own password |
| GET | /api/patients, /api/patients/:id | signed in | patients (clinicians: assigned only) |
| POST | /api/patients/:id/assign, /unassign | admin | give or remove access `{userId}` |
| GET | /api/recordings/:id | signed in | one recording with predictions |
| POST | /api/recordings/import | admin | import ML output (`?overwrite=true` to replace) |
| GET, PATCH | /api/alarms, /api/alarms/:id | signed in | alarm inbox |
| GET | /api/results | signed in | per-model event summary |
| GET | /api/stats | signed in | PR-AUC per subject, Friedman test, 3x3 table |
| GET | /api/frozen | signed in | frozen reference results |
| GET, POST | /api/users | admin | list or create users |
| PATCH | /api/users/:id | admin | role or enable/disable |
| POST | /api/users/:id/password | admin | reset a password |
| GET | /api/health | public | health check |

## 5. ML output format (one JSON per recording)

Required: `recording {edf, duration_s, subject}`, `settings {window_s}`, and `models` with at least one of `"15"`, `"30"`, `"60"`, each holding `window_start_sec[]`, `probability[]` (0 to 1), `alarms_sec[]` and `threshold`.

Optional, filled by `ml/make_predictions.py`:

* `recording.abs_offset_s`: seconds on the subject's continuous clock at the start of the file.
* `recording.fold`.
* `seizures_sec [{start, end}]` and `zones`.
* `labels {"15": [...], "30": [...], "60": [...]}`: one value per window (-1 unscored, 0 interictal, 1 positive).
* `models[d].alarm_leads_s[]`: seconds from each alarm to the next seizure onset, `null` if none. It may point into the next file.

## 6. Limits

* Results cover fold 2 only (test subjects SUBJ_02, SUBJ_06, SUBJ_10). Other folds are still to come.
* The Friedman test needs at least two subjects with two or more seizures each and all three models.
* The demo data created by `npm run seed` is fake and flagged as such in the app.

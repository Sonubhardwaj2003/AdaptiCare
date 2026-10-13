# AdaptiCare

A web dashboard for reviewing EEG seizure-prediction output and comparing how the length of the
"pre-seizure" training label (15, 30 or 60 minutes) changes results on patients the model has never seen.

Built as a final-year major project. The research uses the public CHB-MIT scalp EEG dataset.
AdaptiCare is a research prototype, not a clinical tool.

---

## 1. What the project does

- Researchers train three seizure-prediction models. They differ only in how many minutes before a seizure
  count as "pre-seizure" in training: **15, 30 or 60**.
- AdaptiCare stores each model's output per EEG recording: a risk score for every 5-second window, and the
  alarm times.
- Clinicians sign in and see **only the patients assigned to them**, replay a recording over time as if it
  were live, and **acknowledge or dismiss alarms**.
- A Results page compares the three label durations: sensitivity, lead time, false alarms per hour.

**Example.** Dr. Meera signs in, opens patient SUBJ_01, picks recording `chb01_03.edf` and presses Replay.
The risk line climbs, the 30 min model raises an alarm 12 minutes before the seizure, and the alarm appears
in her inbox. She acknowledges it. Dr. Arjun cannot see this patient at all.

## 2. Flow

```
 EEG recording (CHB-MIT .edf)
        |
        v
 ML pipeline (Python, separate repo/notebooks)
   filter -> 5 s windows -> model (15 / 30 / 60 min)
        |  output: risk per window + alarm times  (see sample_data/mock_prediction.json)
        v
 POST /api/recordings/import   (admin)          <-- or `npm run seed` for demo data
        |
        v
 MongoDB:  users, patients, recordings, alarms
        |
        v
 Express API (JWT login, role + patient access control)
        |
        v
 React dashboard:  Login -> Dashboard -> Patients -> Recording viewer (replay)
                                      \-> Alarms inbox -> Results
```

## 3. Features

| Area | What you get |
|---|---|
| Accounts | Sign in only. There is no public sign-up: **only admins create accounts**. JWT, roles: admin and clinician, failed-login lockout |
| Navigation | Sticky top navbar with active-page highlight, mobile menu, footer with tech stack |
| Responsive | Works on desktop, tablet and phone (tables scroll, menu collapses) |
| Multi-patient, multi-user | Each clinician sees only assigned patients, enforced in the API |
| Recording viewer | Risk chart, threshold, seizure, warning and scoring zones, 15/30/60 and compare view |
| Replay mode | Plays a recording at 30x to 300x, alarms appear as time passes |
| Alarm inbox | New / acknowledged / dismissed, with who handled it and when |
| Results | Per-label-duration sensitivity, mean lead time, false alarms per hour |
| User management | Admin creates users, changes roles, disables or enables accounts, resets passwords. Disabling takes effect immediately |
| Patient access | Admin assigns and removes clinicians on each patient page |
| Profile | Every user has a profile page (click the name in the navbar): photo upload, name, password change and Sign out |
| Statistics | Per-subject PR-AUC, Friedman test, and the "trained on vs scored against" 3x3 table |
| Import | `npm run import` loads the ML team's JSON files into MongoDB, with validation. Also an admin API endpoint |

## 4. Tech stack

React 18 + Vite + React Router + Tailwind CSS, Node.js + Express, MongoDB + Mongoose, JWT + bcrypt.

## 5. Project structure

```
adapticare/
  backend/
    .env                 server settings (port, MongoDB URL, secret)
    scripts/
      import-predictions.js  loads ML output files into MongoDB
    src/
      server.js          app start + MongoDB connection
      routes.js          all API endpoints
      models.js          User, Patient, Recording, Alarm
      auth.js            JWT sign + role middleware
      ingest.js          validates and saves one ML output payload + creates alarms
      stats.js           PR-AUC, Friedman test, 3x3 table (pure functions)
      mockgen.js         FAKE data generator for the demo
      seed.js            resets the DB and loads demo data
  frontend/
    .env                 API URL
    tailwind.config.js   colours, fonts, breakpoints (the design tokens)
    src/
      index.css          Tailwind setup (only a few base styles)
      main.jsx App.jsx   routing, login, navbar, footer
      ui.jsx             shared Tailwind pieces (Button, Card, Table, Field, Avatar ...)
                         and `wrap`, the one page-width setting for navbar, page and footer
      pages.jsx          Dashboard, Patients, Viewer, Alarms, Results, Statistics, Users, About
      Profile.jsx        profile page: photo, name, password, sign out
      Chart.jsx          risk-over-time SVG chart
      api.jsx            fetch helper, auth context
    public/favicon.svg   app icon
  sample_data/
    mock_prediction.json example of the ML output format
  INSTRUCTIONS.md        step-by-step guide after unzipping
```

## 6. Quick start

Needs Node.js 18+ and MongoDB (local or free MongoDB Atlas). Full details: `INSTRUCTIONS.md`.

```
# terminal 1
cd backend
npm install
npm run seed      # demo users, patients, recordings
npm start         # http://localhost:5000

# terminal 2
cd frontend
npm install
npm run dev       # http://localhost:5173
```

Demo accounts (created by the seed):

| Role | Email | Password |
|---|---|---|
| Admin | admin@adapticare.local | Admin@123 |
| Clinician | meera@adapticare.local | Doctor@123 |
| Clinician | arjun@adapticare.local | Doctor@123 |

## 6a. Load the real ML output

Put the ML team's JSON files (one per recording, format in section 8) in a folder, then from `backend/`:
```
npm run import -- ../ml_output --reset-demo
```
`--reset-demo` removes the fake demo recordings first. `--overwrite` replaces recordings that are already
imported. Each file is validated, and a clear message is printed for any file that is rejected.
The patient code is taken from `recording.subject` (or `patientCode`) in each file.

## 7. API

All routes are under `/api`. Everything except `/health` and `/auth/login` needs `Authorization: Bearer <token>`.

| Method | Route | Who | Purpose |
|---|---|---|---|
| POST | /auth/login | anyone | get a token |
| GET | /auth/me | signed in | current user |
| GET | /patients, /patients/:id | signed in | patients (scoped to the user) |
| POST | /patients/:id/assign, /unassign | admin | give or remove a clinician's access `{userId}` |
| GET | /recordings/:id | signed in | full recording with predictions |
| POST | /recordings/import | admin | import ML output (add `?overwrite=true` to replace) |
| GET | /stats | signed in | per-subject PR-AUC, Friedman test, 3x3 table |
| GET | /alarms?status= | signed in | alarm list |
| PATCH | /alarms/:id | signed in | set status `{status, note}` |
| GET | /results | signed in | per-model summary |
| GET, POST | /users | admin | list / create users |
| PATCH | /users/:id | admin | change role or enable/disable `{role, active}` |
| POST | /users/:id/password | admin | reset a password `{password}` |
| PATCH | /auth/me | signed in | change own name or photo `{name, avatar}` |
| POST | /auth/password | signed in | change own password `{currentPassword, newPassword}` |

## 8. ML data contract

The ML side provides one JSON object per recording (example: `sample_data/mock_prediction.json`):
`recording {edf, duration_s}`, `settings`, `seizures_sec [{start,end}]`, `zones`, and `models` with keys
`15`, `30`, `60`, each holding `window_start_sec`, `probability`, `alarms_sec`, `threshold`.
Alarms are decided on the ML side. AdaptiCare only stores and displays them.

## 9. Current status and limits

- The demo database holds **fake data** made by `mockgen.js`, and the app labels it as demo data. Real model results replace it through `npm run import`.
- The Statistics page needs recordings without seizures (interictal) to have negative windows. Import those too.
- Recordings are replayed from stored results. There is no live EEG stream.
- Datasets and model files stay out of git. Only code and small JSON files belong here.

## 10. Roadmap

1. Import the real model output from the ML team (all 15 trained models) and check the Statistics page against the paper's own analysis.
2. Bootstrap confidence intervals and Wilcoxon post-hoc tests with Holm correction.
3. Event-level metrics per subject (sensitivity, false alarms per hour) as in the paper plan.
4. Deployment (HTTPS, hosted MongoDB) and automated tests.

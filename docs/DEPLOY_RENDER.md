# Deploying AdaptiCare on Render

Architecture: the model is **not** run on the server. The ML pipeline runs on your computer, its output is imported into MongoDB Atlas, and Render only hosts the web app and the API.

```
your computer:  EDF -> ml/make_predictions.py -> npm run import ---> MongoDB Atlas
Render:         adapticare-api (Node, reads Atlas)  <-  adapticare-web (React, static)
```

Render's free plan cannot hold PyTorch, MNE and several GB of EEG files, and it does not need to.

## 1. Before you start

1. **MongoDB Atlas, Database Access:** set a new password for your database user (the old one appeared in a screenshot). Put the new one in `backend/.env`.
2. **MongoDB Atlas, Network Access:** add `0.0.0.0/0`. Render's free plan has no fixed IP address.
3. **Connection string:** it must contain the database name, as in `...mongodb.net/adapticare?retryWrites=true&w=majority&appName=Cluster0`.
4. If your password contains special characters (`@ # / :`), replace them with percent codes (`@` becomes `%40`).
5. Your local `backend/.env` must point to the same Atlas cluster. The import in step 2 below then writes straight into the database that Render will use.

## 2. Prepare the data (on your computer, from `backend/`)

```
npm run create-admin -- "Your Name" you@example.com 'A-long-password' --remove-demo-users
npm run import -- ../ml_output --reset-demo
```

The first command creates your admin account and deletes the demo accounts (`admin@adapticare.local` and others, whose passwords are public). The second loads the real recordings and removes the fake ones. Use single quotes around the password in PowerShell.

Do **not** run `npm run seed` on this database. It refuses to run when real data exists.

## 3. Put the project on GitHub

```
git add .
git status          make sure no .env file and no .edf file is listed
git commit -m "AdaptiCare: real data pipeline and deployment"
git push
```
A private repository is recommended. `.gitignore` already excludes `.env`, EDF files, model files, `ml/data` and `ml_output`.

## 4. Create the API (Render, New + Web Service)

| Setting | Value |
|---|---|
| Repository | your AdaptiCare repository |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance type | Free |
| Health Check Path | `/api/health` |

Environment variables:

| Key | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random value (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `CLIENT_URL` | leave empty for now, set in step 6 |

After the first deploy, open `https://YOUR-API.onrender.com/` . It should show `{"name":"AdaptiCare API","ok":true}`. Copy this address.

## 5. Create the web app (Render, New + Static Site)

| Setting | Value |
|---|---|
| Repository | the same repository |
| Root Directory | `frontend` |
| Build Command | `npm install --include=dev && npm run build` |
| Publish Directory | `dist` |

Environment variables: `NODE_VERSION` = `20`, and `VITE_API_URL` = `https://YOUR-API.onrender.com/api` (with `/api` at the end).

Open the **Redirects/Rewrites** tab of the static site and add: Source `/*`, Destination `/index.html`, Action **Rewrite**. Without it, reloading a page such as `/stats` shows "Not Found".

## 6. Connect the two

1. Copy the static site address, for example `https://adapticare-web.onrender.com` (no slash at the end).
2. In the API service, set `CLIENT_URL` to that address. Render redeploys automatically.
3. Open the static site and sign in with the admin account from step 2.

`VITE_API_URL` is baked into the web app at build time. If you ever change it, trigger **Manual Deploy** on the static site.

## 7. Optional: Blueprint

`render.yaml` in the project root describes both services. In Render choose **New + Blueprint**, select the repository, and enter `MONGODB_URI`, `CLIENT_URL` and `VITE_API_URL` when asked. If the Blueprint reports an error, use the manual steps above.

## 8. Final checks

* Sign in as admin, open Users, create a clinician, open a patient and assign the clinician.
* Sign in as that clinician and confirm that only the assigned patients are visible.
* Open Statistics: the frozen results appear on top and the numbers are 9/9, 2/9 and 7/9.
* Reload the page on `/stats` to confirm the rewrite rule works.

## 9. Updating later

* **Code change:** `git push`. Render deploys again by itself.
* **New model output:** run the pipeline on your computer and `npm run import -- ../ml_output --overwrite`. No redeploy is needed.
* **New frozen results** (other folds): edit `backend/data/frozen_fold2.json` and push.

## 10. Good to know

* The free API sleeps after about 15 minutes without requests. The first request afterwards takes up to a minute. Open the site a minute before a demo.
* The free plan is fine for a demo. For regular use, choose a paid instance.
* Atlas free tier (M0) has 512 MB. The 68 recordings use roughly 30 to 60 MB.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Login says "Cannot reach the server" | `VITE_API_URL` is wrong or the API is asleep. Open the API address in a tab, wait, retry. |
| Browser console shows a CORS error | `CLIENT_URL` on the API differs from the web address (check `https`, no slash at the end). |
| API log says "Could not connect to MongoDB" | Atlas Network Access is missing `0.0.0.0/0`, or the password in `MONGODB_URI` is wrong or not percent-encoded. |
| API exits with "JWT_SECRET is missing" | Set a `JWT_SECRET` of at least 24 characters. |
| Web build fails with "vite: not found" | Use the build command with `--include=dev`. |
| Pages show "Not Found" after reload | Add the rewrite rule in step 5. |

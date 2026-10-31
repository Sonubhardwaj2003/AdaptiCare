// Processing of uploaded EDF files: one file at a time is sent to the Python model service,
// the returned prediction is stored like any other recording, and the EDF is deleted.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Patient, Upload } = require("./models");
const { ingestRecording, validatePayload } = require("./ingest");

const DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), "adapticare-uploads");
const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 500);
const ML_URL = () => (process.env.ML_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");
const ML_HEADERS = () => (process.env.ML_SERVICE_KEY ? { "X-ML-Key": process.env.ML_SERVICE_KEY } : {});

async function mlStatus() {
  try {
    const res = await fetch(`${ML_URL()}/health`, { headers: ML_HEADERS(), signal: AbortSignal.timeout(3000) });
    return { mlService: res.ok ? "online" : "offline" };
  } catch {
    return { mlService: "offline" };
  }
}

async function callMl(upload, patientCode) {
  const blob = fs.openAsBlob ? await fs.openAsBlob(upload.tmpPath) : new Blob([await fs.promises.readFile(upload.tmpPath)]);
  const form = new FormData();
  form.append("file", blob, upload.filename);
  form.append("patient", patientCode);
  let res;
  try {
    res = await fetch(`${ML_URL()}/process`, { method: "POST", headers: ML_HEADERS(), body: form, signal: AbortSignal.timeout(30 * 60 * 1000) });
  } catch (e) {
    throw new Error("The model service is not reachable. Start it (see ml/README.md) and upload again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `Model service error (${res.status})`);
  return body;
}

async function processOne(id) {
  const up = await Upload.findById(id);
  if (!up) return;
  try {
    up.status = "processing";
    await up.save();
    const patient = await Patient.findById(up.patient);
    if (!patient) throw new Error("The patient no longer exists.");
    const payload = await callMl(up, patient.code);
    const bad = validatePayload(payload);
    if (bad) throw new Error(`The model service returned invalid data: ${bad}`);
    const rec = await ingestRecording(up.patient, payload, { source: "uploaded" });
    if (!rec) throw new Error("A recording with this file name already exists for this patient.");
    up.status = "done";
    up.recording = rec._id;
  } catch (e) {
    up.status = "failed";
    up.error = String(e.message || e).slice(0, 300);
  } finally {
    await fs.promises.unlink(up.tmpPath).catch(() => {});
    up.tmpPath = undefined;
    await up.save().catch(() => {});
  }
}

const queue = [];
let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) await processOne(queue.shift());
  } finally {
    running = false;
  }
}
const enqueue = (id) => { queue.push(id); run(); };

// Called once at start-up: files that were waiting when the server stopped are lost, so mark them failed.
async function recover() {
  await Upload.updateMany({ status: { $in: ["queued", "processing"] } },
    { $set: { status: "failed", error: "The server restarted before this file was processed. Upload it again." }, $unset: { tmpPath: 1 } });
  try { for (const f of fs.readdirSync(DIR)) fs.unlinkSync(path.join(DIR, f)); } catch { /* folder does not exist yet */ }
}

module.exports = { DIR, MAX_MB, mlStatus, enqueue, recover, processOne };
// EDF upload. Only admins and the clinicians a patient is assigned to may upload for that patient.
const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const { Patient, Upload } = require("./models");
const { auth } = require("./auth");
const { DIR, MAX_MB, mlStatus, enqueue } = require("./uploads");

const r = express.Router();
const w = (f) => (q, s, n) => Promise.resolve(f(q, s, n)).catch(n);
const CODE = /^[A-Za-z0-9_-]{2,30}$/;
const view = (u) => ({ _id: u._id, filename: u.filename, size: u.size, status: u.status, error: u.error, recording: u.recording, createdAt: u.createdAt });
const mayUpload = (user, patient) => user.role === "admin" || (patient.assignedTo || []).some((id) => String(id) === String(user.id));

// Runs BEFORE multer, so files from someone without access are never written to disk.
const check = w(async (q, s, next) => {
  const { patientId, newPatientCode } = q.query;
  if (patientId) {
    const p = await Patient.findById(patientId);
    if (!p || !mayUpload(q.user, p)) return s.status(403).json({ error: "You can only upload files for patients assigned to you." });
    q.patient = p;
  } else if (newPatientCode) {
    const code = String(newPatientCode).trim();
    if (!CODE.test(code)) return s.status(400).json({ error: "Patient code: 2 to 30 letters, digits, - or _." });
    if (await Patient.findOne({ code })) return s.status(409).json({ error: "This patient code already exists. Choose the patient from the list or use another code." });
    q.newCode = code;
  } else {
    return s.status(400).json({ error: "Choose a patient or give a new patient code." });
  }
  next();
});

const receive = multer({
  storage: multer.diskStorage({
    destination: (q, f, cb) => { fs.mkdirSync(DIR, { recursive: true }); cb(null, DIR); },
    filename: (q, f, cb) => cb(null, `${crypto.randomUUID()}.edf`),
  }),
  fileFilter: (q, f, cb) => (/\.edf$/i.test(f.originalname) ? cb(null, true) : cb(new Error("ONLY_EDF"))),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 20 },
}).array("files", 20);

const parse = (q, s, next) => receive(q, s, (err) => {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") return s.status(413).json({ error: `A file is larger than ${MAX_MB} MB.` });
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") return s.status(400).json({ error: "At most 20 files at a time." });
  if (err.message === "ONLY_EDF") return s.status(400).json({ error: "Only .edf files are accepted." });
  s.status(400).json({ error: "The upload failed. Try again." });
});

r.post("/uploads", auth, check, parse, w(async (q, s) => {
  const files = q.files || [];
  if (!files.length) return s.status(400).json({ error: "Choose at least one .edf file." });
  const drop = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  let patient = q.patient;
  if (!patient) {
    try {
      // The clinician who creates a patient is assigned to it, so they can keep uploading for it.
      patient = await Patient.create({ code: q.newCode, assignedTo: q.user.role === "admin" ? [] : [q.user.id] });
    } catch (e) {
      drop();
      return e.code === 11000 ? s.status(409).json({ error: "This patient code already exists." }) : s.status(500).json({ error: "Could not create the patient." });
    }
  }
  const ups = [];
  for (const f of files) ups.push(await Upload.create({ patient: patient._id, user: q.user.id, filename: f.originalname, size: f.size, tmpPath: f.path }));
  ups.forEach((u) => enqueue(String(u._id)));
  s.status(202).json({ patient: { _id: patient._id, code: patient.code }, uploads: ups.map(view) });
}));

r.get("/uploads/status", auth, w(async (q, s) => s.json({ ...(await mlStatus()), maxMb: MAX_MB })));

r.get("/uploads", auth, w(async (q, s) => {
  const p = await Patient.findById(q.query.patient);
  if (!p || !mayUpload(q.user, p)) return s.status(403).json({ error: "You can only see uploads for patients assigned to you." });
  const list = await Upload.find({ patient: p._id }).sort({ createdAt: -1 }).limit(50).lean();
  s.json(list.map(view));
}));

module.exports = r;
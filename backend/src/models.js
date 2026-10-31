const mongoose = require("mongoose");
const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

const User = model("User", new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "clinician"], default: "clinician" },
  active: { type: Boolean, default: true },
  avatar: { type: String, default: "" },
}, { timestamps: true }));

// Patients are anonymised codes (SUBJ_01 ...). A clinician only sees patients assigned to them.
const Patient = model("Patient", new Schema({
  code: { type: String, unique: true },
  assignedTo: [ref("User")],
}, { timestamps: true }));

// One EEG recording + the three models' output (format: sample_data/mock_prediction.json)
const Recording = model("Recording", new Schema({
  patient: { ...ref("Patient"), index: true },
  edf: String,
  fold: Number,
  annotated: Boolean, // false = uploaded by a user without seizure annotation, so it is not scored in Results or Statistics
  source: { type: String, enum: ["demo", "imported", "uploaded"], default: "imported" },
  duration_s: Number,
  abs_offset_s: Number, // seconds on the subject's continuous clock at the start of this file (real data only)
  labels: Object,       // optional per-window labels {"15": [...], "30": [...], "60": [...]} with -1 unscored, 0 interictal, 1 positive
  seizures: [{ start: Number, end: Number }],
  zones: Object,
  settings: Object,
  predictions: Object, // { "15": {window_start_sec, probability, alarms_sec, threshold}, "30": ..., "60": ... }
}, { timestamps: true }));

const Alarm = model("Alarm", new Schema({
  recording: ref("Recording"),
  patient: { ...ref("Patient"), index: true },
  duration: Number, // which model raised it: 15, 30 or 60
  time_s: Number,
  lead_s: Number, // seconds from this alarm to the next seizure onset (may be in the next file); null if none
  status: { type: String, enum: ["new", "acknowledged", "dismissed"], default: "new" },
  note: String,
  handledBy: ref("User"),
  handledAt: Date,
}, { timestamps: true }));

// One uploaded EDF file and what happened to it. The EDF itself is deleted after processing.
const Upload = model("Upload", new Schema({
  patient: { ...ref("Patient"), index: true },
  user: ref("User"),
  filename: String,
  size: Number,
  status: { type: String, enum: ["queued", "processing", "done", "failed"], default: "queued" },
  error: String,
  recording: ref("Recording"),
  tmpPath: String,
}, { timestamps: true }));

module.exports = { User, Patient, Recording, Alarm, Upload };

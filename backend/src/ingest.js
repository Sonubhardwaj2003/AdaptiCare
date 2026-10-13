const { Recording, Alarm } = require("./models");

// Returns an error message if the ML output does not follow the contract, otherwise null.
exports.validatePayload = (p) => {
  if (!p || !p.recording || !p.recording.edf || !(p.recording.duration_s > 0)) return "recording.edf and recording.duration_s are required";
  if (!p.settings || !(p.settings.window_s > 0)) return "settings.window_s is required";
  const keys = Object.keys(p.models || {});
  if (!keys.length || keys.some((k) => !["15", "30", "60"].includes(k))) return "models must contain at least one of 15, 30, 60";
  let len = null;
  for (const d of keys) {
    const m = p.models[d];
    const { window_start_sec: ws, probability: pr, alarms_sec: al, threshold } = m;
    if (!Array.isArray(ws) || !Array.isArray(pr) || !ws.length || ws.length !== pr.length) return `models.${d}: window_start_sec and probability must be non-empty arrays of the same length`;
    if (len !== null && ws.length !== len) return "All models in one file must have the same number of windows";
    len = ws.length;
    if (!pr.every((x) => typeof x === "number" && x >= 0 && x <= 1)) return `models.${d}: probability values must be numbers between 0 and 1`;
    if (!Array.isArray(al) || !al.every(Number.isFinite)) return `models.${d}: alarms_sec must be an array of numbers`;
    if (typeof threshold !== "number") return `models.${d}: threshold is required`;
  }
  return null;
};

// Stores one prediction payload and creates an alarm per alarm time.
// Returns null if the recording already exists for this patient and overwrite is false.
exports.ingestRecording = async (patientId, p, { overwrite = false } = {}) => {
  const exists = await Recording.findOne({ patient: patientId, edf: p.recording.edf });
  if (exists) {
    if (!overwrite) return null;
    await Alarm.deleteMany({ recording: exists._id });
    await exists.deleteOne();
  }
  const rec = await Recording.create({
    patient: patientId,
    edf: p.recording.edf,
    fold: p.recording.fold,
    source: p._mock ? "demo" : "imported",
    duration_s: p.recording.duration_s,
    seizures: p.seizures_sec || [],
    zones: p.zones || null,
    settings: p.settings,
    predictions: p.models,
  });
  const alarms = [];
  for (const d of Object.keys(p.models))
    for (const t of p.models[d].alarms_sec)
      alarms.push({ recording: rec._id, patient: patientId, duration: Number(d), time_s: t });
  if (alarms.length) await Alarm.insertMany(alarms);
  return rec;
};

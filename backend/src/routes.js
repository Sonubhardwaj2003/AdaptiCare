const r = require("express").Router();
const bcrypt = require("bcryptjs");
const { User, Patient, Recording, Alarm } = require("./models");
const { sign, auth, admin } = require("./auth");
const { ingestRecording, validatePayload } = require("./ingest");
const { subjectStats } = require("./stats");

const w = (f) => (q, s, n) => f(q, s, n).catch(n);
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, avatar: u.avatar || "" });
// Access control: admins see everything, clinicians only their assigned patients.
const ids = async (u) => (u.role === "admin" ? null : Patient.find({ assignedTo: u.id }).distinct("_id"));
const onPatient = async (u) => { const x = await ids(u); return x ? { _id: { $in: x } } : {}; };
const onField = async (u) => { const x = await ids(u); return x ? { patient: { $in: x } } : {}; };

r.get("/health", (q, s) => s.json({ ok: true }));

// Basic brute-force protection: 10 failed sign-ins per IP in 15 minutes locks that IP out for the rest of the window.
const fails = new Map();
r.post("/auth/login", w(async (q, s) => {
  const now = Date.now(), recent = (fails.get(q.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 10) return s.status(429).json({ error: "Too many failed sign-in attempts. Try again in 15 minutes." });
  const u = await User.findOne({ email: String(q.body.email || "").toLowerCase() });
  if (!u || !(await bcrypt.compare(String(q.body.password || ""), u.passwordHash))) {
    fails.set(q.ip, [...recent, now]);
    return s.status(401).json({ error: "Incorrect email or password" });
  }
  if (u.active === false) return s.status(403).json({ error: "This account is disabled. Contact an admin." });
  fails.delete(q.ip);
  s.json({ token: sign(u), user: pub(u) });
}));

r.get("/auth/me", auth, w(async (q, s) => {
  const u = await User.findById(q.user.id);
  if (!u) return s.status(401).json({ error: "Please sign in again" });
  s.json(pub(u));
}));

// Own profile: name and photo. The photo is a small square image (data URL) made in the browser.
r.patch("/auth/me", auth, w(async (q, s) => {
  const upd = {};
  if (q.body.name !== undefined) {
    const name = String(q.body.name).trim();
    if (name.length < 2 || name.length > 60) return s.status(400).json({ error: "Name must be 2 to 60 characters" });
    upd.name = name;
  }
  if (q.body.avatar !== undefined) {
    const a = String(q.body.avatar);
    if (a && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) || a.length > 250000)) return s.status(400).json({ error: "Photo must be a small JPG, PNG or WebP image" });
    upd.avatar = a;
  }
  const u = await User.findByIdAndUpdate(q.user.id, upd, { new: true });
  u ? s.json(pub(u)) : s.status(401).json({ error: "Please sign in again" });
}));

r.post("/auth/password", auth, w(async (q, s) => {
  const u = await User.findById(q.user.id);
  const next = String(q.body.newPassword || "");
  if (!u || !(await bcrypt.compare(String(q.body.currentPassword || ""), u.passwordHash))) return s.status(400).json({ error: "Current password is incorrect" });
  if (next.length < 8) return s.status(400).json({ error: "New password must be at least 8 characters" });
  u.passwordHash = await bcrypt.hash(next, 10);
  await u.save();
  s.json({ ok: true });
}));

r.get("/patients", auth, w(async (q, s) => {
  const ps = await Patient.find(await onPatient(q.user)).sort("code").lean();
  const pid = ps.map((p) => p._id);
  const count = async (M, extra = {}) =>
    Object.fromEntries((await M.aggregate([{ $match: { patient: { $in: pid }, ...extra } }, { $group: { _id: "$patient", n: { $sum: 1 } } }])).map((x) => [String(x._id), x.n]));
  const [R, A] = await Promise.all([count(Recording), count(Alarm, { status: "new" })]);
  s.json(ps.map((p) => ({ ...p, recordings: R[p._id] || 0, newAlarms: A[p._id] || 0 })));
}));

r.get("/patients/:id", auth, w(async (q, s) => {
  const p = await Patient.findOne({ $and: [{ _id: q.params.id }, await onPatient(q.user)] }).populate("assignedTo", "name email").lean();
  if (!p) return s.status(404).json({ error: "Patient not found" });
  s.json({ patient: p, recordings: await Recording.find({ patient: p._id }).select("-predictions").lean() });
}));

r.post("/patients/:id/assign", auth, admin, w(async (q, s) => {
  const p = await Patient.findByIdAndUpdate(q.params.id, { $addToSet: { assignedTo: q.body.userId } }, { new: true });
  p ? s.json(p) : s.status(404).json({ error: "Patient not found" });
}));

r.post("/patients/:id/unassign", auth, admin, w(async (q, s) => {
  const p = await Patient.findByIdAndUpdate(q.params.id, { $pull: { assignedTo: q.body.userId } }, { new: true });
  p ? s.json(p) : s.status(404).json({ error: "Patient not found" });
}));

r.get("/recordings/:id", auth, w(async (q, s) => {
  const rec = await Recording.findOne({ $and: [{ _id: q.params.id }, await onField(q.user)] }).populate("patient", "code").lean();
  rec ? s.json(rec) : s.status(404).json({ error: "Recording not found" });
}));

// Admin: import one prediction payload (ML output contract) for a patient code.
r.post("/recordings/import", auth, admin, w(async (q, s) => {
  const { patientCode, ...payload } = q.body;
  const code = patientCode || payload.recording?.subject;
  if (!code) return s.status(400).json({ error: "patientCode (or recording.subject) is required" });
  const bad = validatePayload(payload);
  if (bad) return s.status(400).json({ error: bad });
  const p = (await Patient.findOne({ code })) || (await Patient.create({ code }));
  const rec = await ingestRecording(p._id, payload, { overwrite: q.query.overwrite === "true" });
  if (!rec) return s.status(409).json({ error: "This recording is already imported. Add ?overwrite=true to replace it (its alarms are reset)." });
  s.status(201).json(rec);
}));

r.get("/alarms", auth, w(async (q, s) => {
  const f = await onField(q.user);
  if (q.query.status) f.status = q.query.status;
  s.json(await Alarm.find(f).sort({ createdAt: -1, time_s: 1 }).populate("patient", "code").populate("recording", "edf seizures").lean());
}));

r.patch("/alarms/:id", auth, w(async (q, s) => {
  const { status, note } = q.body;
  if (!["new", "acknowledged", "dismissed"].includes(status)) return s.status(400).json({ error: "Invalid status" });
  const a = await Alarm.findOneAndUpdate({ $and: [{ _id: q.params.id }, await onField(q.user)] },
    { status, note, handledBy: q.user.id, handledAt: new Date() }, { new: true });
  a ? s.json(a) : s.status(404).json({ error: "Alarm not found" });
}));

// Per-model summary over the recordings the user may see.
// Hit = alarm 5 to 35 min before onset. Early = 35 to 65 min before (unscored). Anything else = false alarm.
r.get("/results", auth, w(async (q, s) => {
  const recs = await Recording.find(await onField(q.user)).lean();
  const hours = recs.reduce((a, x) => a + x.duration_s, 0) / 3600;
  const perModel = {};
  for (const d of ["15", "30", "60"]) {
    let seizures = 0, detected = 0, early = 0, falseAlarms = 0; const leads = [];
    for (const rc of recs) {
      const on = rc.seizures[0]?.start;
      if (on != null) seizures++;
      let hit = false;
      for (const t of rc.predictions[d].alarms_sec) {
        const lead = on == null ? null : on - t;
        if (lead != null && lead >= 300 && lead <= 2100) { if (!hit) { hit = true; detected++; leads.push(lead); } }
        else if (lead != null && lead > 2100 && lead <= 3900) early++;
        else falseAlarms++;
      }
    }
    perModel[d] = {
      seizures, detected, earlyAlarms: early, falseAlarms,
      sensitivity: seizures ? detected / seizures : null,
      falseAlarmsPerHour: hours ? falseAlarms / hours : null,
      meanLeadMin: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length / 60 : null,
    };
  }
  s.json({ recordings: recs.length, hours, demo: recs.some((x) => x.source === "demo"), perModel });
}));

r.get("/stats", auth, w(async (q, s) => {
  s.json(subjectStats(await Recording.find(await onField(q.user)).populate("patient", "code").lean()));
}));

r.get("/users", auth, admin, w(async (q, s) => s.json(await User.find().select("-passwordHash").lean())));
r.post("/users", auth, admin, w(async (q, s) => {
  const { name, email, password, role } = q.body;
  if (!name || !email || !password || password.length < 8) return s.status(400).json({ error: "Name, email and a password of 8+ characters are required" });
  if (await User.findOne({ email: String(email).toLowerCase() })) return s.status(409).json({ error: "Email already in use" });
  const u = await User.create({ name, email, role: role === "admin" ? "admin" : "clinician", passwordHash: await bcrypt.hash(password, 10) });
  s.status(201).json({ id: u._id, name: u.name, email: u.email, role: u.role });
}));

r.patch("/users/:id", auth, admin, w(async (q, s) => {
  if (q.params.id === q.user.id) return s.status(400).json({ error: "You cannot change your own role or status" });
  const upd = {};
  if (q.body.role !== undefined) { if (!["admin", "clinician"].includes(q.body.role)) return s.status(400).json({ error: "Invalid role" }); upd.role = q.body.role; }
  if (typeof q.body.active === "boolean") upd.active = q.body.active;
  const u = await User.findByIdAndUpdate(q.params.id, upd, { new: true }).select("-passwordHash");
  u ? s.json(u) : s.status(404).json({ error: "User not found" });
}));

r.post("/users/:id/password", auth, admin, w(async (q, s) => {
  const password = String(q.body.password || "");
  if (password.length < 8) return s.status(400).json({ error: "Password must be at least 8 characters" });
  const u = await User.findByIdAndUpdate(q.params.id, { passwordHash: await bcrypt.hash(password, 10) });
  u ? s.json({ ok: true }) : s.status(404).json({ error: "User not found" });
}));

module.exports = r;

// Imports the ML team's prediction files (one JSON per recording) straight into MongoDB.
// Usage (from backend/):  npm run import -- <folder> [--overwrite] [--reset-demo]
//   --overwrite   replace recordings that already exist (their alarms are reset)
//   --reset-demo  delete all demo (fake) recordings and alarms first
// Patient code comes from "patientCode" or "recording.subject" inside each file.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const { Patient, Recording, Alarm } = require("../src/models");
const { ingestRecording, validatePayload } = require("../src/ingest");

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith("--"));
const overwrite = args.includes("--overwrite"), resetDemo = args.includes("--reset-demo");
if (!folder || !fs.existsSync(folder)) {
  console.error("Usage: npm run import -- <folder with .json files> [--overwrite] [--reset-demo]");
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  if (resetDemo) {
    const demo = await Recording.find({ source: "demo" }).select("_id patient").lean();
    const ids = demo.map((r) => r._id), pats = [...new Set(demo.map((r) => String(r.patient)))];
    await Alarm.deleteMany({ recording: { $in: ids } });
    await Recording.deleteMany({ _id: { $in: ids } });
    let gone = 0;
    for (const pid of pats) if (!(await Recording.exists({ patient: pid }))) { await Patient.deleteOne({ _id: pid }); gone++; }
    console.log(`Removed ${ids.length} demo recordings and ${gone} empty demo patients.`);
  }
  const files = fs.readdirSync(folder).filter((f) => f.endsWith(".json")).sort();
  let ok = 0, skipped = 0, failed = 0;
  for (const f of files) {
    try {
      const payload = JSON.parse(fs.readFileSync(path.join(folder, f), "utf8"));
      const code = payload.patientCode || payload.recording?.subject;
      const bad = !code ? "no patientCode or recording.subject" : validatePayload(payload);
      if (bad) { console.log(`FAILED  ${f}: ${bad}`); failed++; continue; }
      const p = (await Patient.findOne({ code })) || (await Patient.create({ code }));
      const rec = await ingestRecording(p._id, payload, { overwrite });
      if (rec) { console.log(`OK      ${f} -> ${code} / ${payload.recording.edf}`); ok++; }
      else { console.log(`SKIPPED ${f}: already imported (use --overwrite)`); skipped++; }
    } catch (e) { console.log(`FAILED  ${f}: ${e.message}`); failed++; }
  }
  console.log(`Done. Imported ${ok}, skipped ${skipped}, failed ${failed}.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

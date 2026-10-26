// Creates demo users, patients, recordings and alarms (all FAKE data). Re-running resets the database.
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Patient, Recording, Alarm } = require("./models");
const { ingestRecording } = require("./ingest");
const { mockPayload } = require("./mockgen");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const real = await Recording.countDocuments({ source: "imported" });
  if ((real > 0 || process.env.NODE_ENV === "production") && !process.argv.includes("--force")) {
    console.error("Refusing to seed: this database holds real imported recordings (or NODE_ENV is production). Seeding deletes everything and creates demo accounts with known passwords. Add --force only if you really want that.");
    await mongoose.disconnect();
    process.exit(1);
  }
  await Promise.all([User.deleteMany(), Patient.deleteMany(), Recording.deleteMany(), Alarm.deleteMany()]);
  const mk = async (name, email, password, role) => User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10) });
  await mk("Admin", "admin@adapticare.local", "Admin@123", "admin");
  const d1 = await mk("Dr. Meera", "meera@adapticare.local", "Doctor@123", "clinician");
  const d2 = await mk("Dr. Arjun", "arjun@adapticare.local", "Doctor@123", "clinician");

  const plan = [
    ["SUBJ_01", d1, [["chb01_03.edf", 11, 2996], ["chb01_04.edf", 12, 1467, 600], ["chb01_10.edf", 13, null]]],
    ["SUBJ_02", d1, [["chb02_16.edf", 21, 2972], ["chb02_19.edf", 22, 3369], ["chb02_05.edf", 23, null, 900]]],
    ["SUBJ_03", d2, [["chb03_01.edf", 31, 2162], ["chb03_02.edf", 32, null, 1800]]],
    ["SUBJ_04", d2, [["chb05_06.edf", 41, 417], ["chb05_02.edf", 42, null]]],
  ];
  for (const [code, doc, recs] of plan) {
    const p = await Patient.create({ code, assignedTo: [doc._id] });
    for (const [edf, seed, onset, falseAt] of recs) await ingestRecording(p._id, mockPayload(edf, seed, onset, falseAt ?? null));
  }
  console.log("Seeded. Accounts: admin@adapticare.local / Admin@123, meera@adapticare.local / Doctor@123, arjun@adapticare.local / Doctor@123");
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });

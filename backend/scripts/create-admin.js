// Creates an admin account, or resets the password of an existing one.
// Usage (from backend/):  npm run create-admin -- "Full Name" email@example.com "a-strong-password" [--remove-demo-users]
//   --remove-demo-users  deletes the fake demo accounts (@adapticare.local) and unassigns them from patients
// In PowerShell, wrap the password in single quotes so characters like $ and ! are kept.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { User, Patient } = require("../src/models");

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [name, email, password] = args.filter((a) => !a.startsWith("--"));
if (!name || !email || !password) {
  console.error('Usage: npm run create-admin -- "Full Name" email@example.com "password" [--remove-demo-users]');
  process.exit(1);
}
if (password.length < 10) { console.error("Use at least 10 characters for the admin password."); process.exit(1); }

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const e = email.toLowerCase();
  const u = await User.findOneAndUpdate({ email: e }, { name, email: e, passwordHash: await bcrypt.hash(password, 10), role: "admin", active: true },
    { upsert: true, new: true, setDefaultsOnInsert: true });
  console.log(`Admin ready: ${u.email}`);
  if (flags.includes("--remove-demo-users")) {
    const demo = await User.find({ email: /@adapticare\.local$/i, _id: { $ne: u._id } }).distinct("_id");
    await User.deleteMany({ _id: { $in: demo } });
    await Patient.updateMany({}, { $pull: { assignedTo: { $in: demo } } });
    console.log(`Removed ${demo.length} demo accounts.`);
  }
  await mongoose.disconnect();
})().catch((err) => { console.error(err.message); process.exit(1); });

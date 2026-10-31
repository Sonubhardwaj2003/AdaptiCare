require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.set("trust proxy", 1); // hosts such as Render put a proxy in front, so req.ip must come from the proxy header
// CLIENT_URL can list several allowed web addresses, separated by commas.
const origins = (process.env.CLIENT_URL || "http://localhost:5173").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
app.use(cors({ origin: origins }));
app.use(express.json({ limit: "20mb" }));
app.get("/", (q, s) => s.json({ name: "AdaptiCare API", ok: true }));
app.use("/api", require("./routes"));
app.use((e, q, s, n) => {
  if (e.name === "CastError") return s.status(404).json({ error: "Not found" });
  console.error(e);
  s.status(500).json({ error: "Server error" });
});

const secret = process.env.JWT_SECRET || "";
if (secret.startsWith("change-this") || secret.length < 24) {
  const msg = "JWT_SECRET is missing, too short or still the default. Set a long random value.";
  if (process.env.NODE_ENV === "production") { console.error(msg); process.exit(1); }
  console.warn("WARNING: " + msg);
}
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
    await require("./uploads").recover(); // uploads that were interrupted by a restart
    app.listen(PORT, () => console.log(`AdaptiCare API on port ${PORT}`));
  })
  .catch((e) => { console.error("Could not connect to MongoDB:", e.message); process.exit(1); });

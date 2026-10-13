require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "20mb" }));
app.use("/api", require("./routes"));
app.use((e, q, s, n) => {
  if (e.name === "CastError") return s.status(404).json({ error: "Not found" });
  console.error(e);
  s.status(500).json({ error: "Server error" });
});

if ((process.env.JWT_SECRET || "").startsWith("change-this")) console.warn("WARNING: set a strong JWT_SECRET in backend/.env before deploying.");
const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => app.listen(PORT, () => console.log(`AdaptiCare API on http://localhost:${PORT}`)))
  .catch((e) => { console.error("Could not connect to MongoDB:", e.message); process.exit(1); });

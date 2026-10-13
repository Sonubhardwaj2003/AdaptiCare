const jwt = require("jsonwebtoken");
const { User } = require("./models");

exports.sign = (u) => jwt.sign({ id: String(u._id) }, process.env.JWT_SECRET, { expiresIn: "8h" });

// Checks the token AND the database, so a disabled user or a changed role takes effect immediately.
exports.auth = async (req, res, next) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const u = await User.findById(id).select("role active").lean();
    if (!u || u.active === false) return res.status(401).json({ error: "Please sign in again" });
    req.user = { id: String(u._id), role: u.role };
    next();
  } catch {
    res.status(401).json({ error: "Please sign in again" });
  }
};

exports.admin = (req, res, next) =>
  req.user.role === "admin" ? next() : res.status(403).json({ error: "Admin access required" });

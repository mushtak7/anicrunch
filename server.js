require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

/* =====================
   TRUST PROXY (RENDER)
===================== */
app.set("trust proxy", 1);

/* =====================
   BASIC MIDDLEWARE
===================== */
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* =====================
   CORS (VERCEL + PROD)
===================== */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (
        origin === "https://anicrunch.vercel.app" ||
        origin.endsWith(".vercel.app")
      ) {
        return cb(null, true);
      }
      cb(new Error("CORS blocked"));
    },
    credentials: true
  })
);

/* =====================
   SESSION SETUP
===================== */
app.use(
  session({
    name: "anicrunch.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

/* =====================
   RATE LIMITING
===================== */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});

/* =====================
   DATABASE (SUPABASE)
===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================
   AUTH GUARD
===================== */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "Login required" });
  }
  next();
}

/* =====================
   AUTH ROUTES
===================== */
app.post("/api/signup", authLimiter, async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const password = req.body.password;

  if (!username || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
      [username, hash]
    );

    req.session.user = {
      id: result.rows[0].id,
      username: result.rows[0].username
    };

    res.json({ user: result.rows[0].username });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "User already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const password = req.body.password;

  const result = await pool.query(
    "SELECT id, username, password FROM users WHERE username=$1",
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const user = result.rows[0];
  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  req.session.user = { id: user.id, username: user.username };
  res.json({ user: user.username });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("anicrunch.sid");
    res.json({ success: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

/* =====================
   WATCHLIST ROUTES
===================== */
app.get("/api/watchlist", requireAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT anime_id FROM watchlists WHERE user_id=$1",
    [req.session.user.id]
  );

  res.json(
    result.rows.map(r => r.anime_id)
  );
});

app.post("/api/watchlist/add", requireAuth, async (req, res) => {
  const { animeId } = req.body;

  await pool.query(
    "INSERT INTO watchlists (user_id, anime_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [req.session.user.id, animeId]
  );

  res.json({ success: true });
});

app.post("/api/watchlist/remove", requireAuth, async (req, res) => {
  const { animeId } = req.body;

  await pool.query(
    "DELETE FROM watchlists WHERE user_id=$1 AND anime_id=$2",
    [req.session.user.id, animeId]
  );

  res.json({ success: true });
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, () => {
  console.log(`✅ anicrunch backend running on port ${PORT}`);
});

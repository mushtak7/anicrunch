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
   CORS SETUP (FIXED)
===================== */
app.use(
  cors({
    origin: true, // ⚠️ Allows ALL origins (Fixes the CORS Blocked error)
    credentials: true // Allows cookies/sessions to work
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
      secure: process.env.NODE_ENV === "production", // Secure in prod only
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

/* =====================
   RATE LIMITING
===================== */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});

/* =====================
   DATABASE (SUPABASE)
===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =====================
   DATABASE INIT (AUTO-MIGRATION)
===================== */
async function initDB() {
  try {
    // Add missing columns to watchlists table
    await pool.query(`
      ALTER TABLE watchlists 
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'plan',
      ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT NULL;
    `);
    
    // Add missing columns to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
    `);
    console.log("✅ Database schema verified/updated");
  } catch (err) {
    console.error("Database migration error:", err);
  }
}
initDB();

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
    if (err.code === "23505") { // Unique violation code
      return res.status(409).json({ message: "User already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const username = req.body.username?.trim().toLowerCase();
  const password = req.body.password;

  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login error" });
  }
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
  try {
    const result = await pool.query(
      "SELECT anime_id, status, progress, score FROM watchlists WHERE user_id=$1",
      [req.session.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching watchlist" });
  }
});

app.post("/api/watchlist/add", requireAuth, async (req, res) => {
  const { animeId } = req.body;

  try {
    // If it exists, we don't overwrite. 
    // Wait, let's explicitly specify conflict target if we can, but DO NOTHING is safe.
    await pool.query(
      "INSERT INTO watchlists (user_id, anime_id, status, progress) VALUES ($1, $2, 'plan', 0) ON CONFLICT DO NOTHING",
      [req.session.user.id, animeId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error adding to watchlist" });
  }
});

app.post("/api/watchlist/update", requireAuth, async (req, res) => {
  const { animeId, status, progress, score } = req.body;

  try {
    await pool.query(
      `UPDATE watchlists 
       SET status = COALESCE($3, status), 
           progress = COALESCE($4, progress),
           score = COALESCE($5, score)
       WHERE user_id=$1 AND anime_id=$2`,
      [req.session.user.id, animeId, status, progress, score]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating watchlist" });
  }
});

app.post("/api/watchlist/remove", requireAuth, async (req, res) => {
  const { animeId } = req.body;

  try {
    await pool.query(
      "DELETE FROM watchlists WHERE user_id=$1 AND anime_id=$2",
      [req.session.user.id, animeId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error removing from watchlist" });
  }
});

/* =====================
   PROFILE ROUTES
===================== */
app.get("/api/profile", requireAuth, async (req, res) => {
  try {
    const userRes = await pool.query(
      "SELECT username, avatar_url, bio FROM users WHERE id=$1",
      [req.session.user.id]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ message: "User not found" });
    
    // Get total anime watched count
    const statsRes = await pool.query(
      "SELECT COUNT(*) FROM watchlists WHERE user_id=$1 AND status='completed'",
      [req.session.user.id]
    );
    
    res.json({
      user: userRes.rows[0],
      stats: {
        totalWatched: parseInt(statsRes.rows[0].count, 10)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching profile" });
  }
});

app.post("/api/profile/update", requireAuth, async (req, res) => {
  const { avatarUrl, bio } = req.body;
  try {
    await pool.query(
      "UPDATE users SET avatar_url=$1, bio=$2 WHERE id=$3",
      [avatarUrl || '', bio || '', req.session.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error updating profile" });
  }
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, () => {
  console.log(`✅ anicrunch backend running on port ${PORT}`);
});

require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs/promises");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================
// ESSENTIAL FOR RENDER/VERCEL
// =====================
// Required because Render sits behind a proxy. 
// Without this, 'secure: true' cookies won't be sent!
app.set("trust proxy", 1); 

// =====================
// BASIC MIDDLEWARE
// =====================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// FIX: Dynamic CORS to allow Production AND Vercel Previews
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Check if origin is your main domain OR a vercel subdomain
      if (
        origin === "https://anicrunch.vercel.app" ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      return callback(new Error("CORS blocked"));
    },
    credentials: true, // Allow cookies to pass
  })
);

// =====================
// SESSION SETUP (SECURE)
// =====================
app.use(
  session({
    name: "anicrunch.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Allow cross-site usage (Vercel -> Render)
      secure: true,        // REQUIRED for SameSite="none"
      sameSite: "none",    // REQUIRED for cross-domain cookies
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  })
);

// =====================
// RATE LIMITERS
// =====================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50
});

const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 120
});

// =====================
// AUTH GUARD
// =====================
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "Login required" });
  }
  next();
}

// =====================
// FILE STORAGE
// =====================
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const WATCHLIST_FILE = path.join(DATA_DIR, "watchlists.json");

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try { await fs.access(USERS_FILE); }
  catch { await fs.writeFile(USERS_FILE, "[]"); }

  try { await fs.access(WATCHLIST_FILE); }
  catch { await fs.writeFile(WATCHLIST_FILE, "{}"); }
}

async function readJSON(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function writeJSON(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

// =====================
// SEARCH CACHE
// =====================
const apiCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of apiCache.entries()) {
    if (now > value.expiry) apiCache.delete(key);
  }
}, 60_000);

// =====================
// SEARCH PROXY (JIKAN)
// =====================
app.get("/api/search", searchLimiter, async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const key = query.toLowerCase();
  const cached = apiCache.get(key);

  if (cached && Date.now() < cached.expiry) {
    return res.json(cached.data);
  }

  try {
    const response = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&sfw=true&limit=24`
    );

    if (!response.ok) {
      return res.status(502).json({ error: "Anime API error" });
    }

    const json = await response.json();
    const results = json.data || [];

    apiCache.set(key, {
      data: results,
      expiry: Date.now() + CACHE_TTL
    });

    res.json(results);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// =====================
// AUTH ROUTES
// =====================
app.post("/api/signup", authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Missing fields" });

  const users = await readJSON(USERS_FILE);
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ message: "User already exists" });
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });
  await writeJSON(USERS_FILE, users);

  const watchlists = await readJSON(WATCHLIST_FILE);
  watchlists[username] = [];
  await writeJSON(WATCHLIST_FILE, watchlists);

  req.session.user = username;
  res.json({ user: username });
});

app.post("/api/login", authLimiter, async (req, res) => {
  const { username, password } = req.body;

  const users = await readJSON(USERS_FILE);
  const user = users.find(u => u.username === username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  req.session.user = username;
  res.json({ user: username });
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

// =====================
// WATCHLIST ROUTES
// =====================
app.get("/api/watchlist", requireAuth, async (req, res) => {
  const lists = await readJSON(WATCHLIST_FILE);
  res.json(lists[req.session.user] || []);
});

app.post("/api/watchlist/add", requireAuth, async (req, res) => {
  const { animeId } = req.body;
  const lists = await readJSON(WATCHLIST_FILE);

  if (!lists[req.session.user]) lists[req.session.user] = [];
  if (!lists[req.session.user].includes(animeId)) {
    lists[req.session.user].push(animeId);
  }

  await writeJSON(WATCHLIST_FILE, lists);
  res.json({ success: true });
});

app.post("/api/watchlist/remove", requireAuth, async (req, res) => {
  const { animeId } = req.body;
  const lists = await readJSON(WATCHLIST_FILE);

  lists[req.session.user] =
    (lists[req.session.user] || []).filter(id => id !== animeId);

  await writeJSON(WATCHLIST_FILE, lists);
  res.json({ success: true });
});

// =====================
// START SERVER
// =====================
ensureStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ anicrunch backend running on http://localhost:${PORT}`);
  });
});

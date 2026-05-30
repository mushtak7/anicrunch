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

/* =====================
   SEO DYNAMIC SITEMAP
===================== */
app.get("/sitemap.xml", async (req, res) => {
  res.header("Content-Type", "application/xml");
  try {
    const dbAnime = await pool.query("SELECT DISTINCT anime_id FROM watchlists");
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Static main paths
    const staticUrls = [
      "",
      "/blog/",
      "/recent-episodes.html",
      "/schedule.html",
      "/vibe-mixer.html",
      "/recommendations.html"
    ];
    
    staticUrls.forEach(url => {
      xml += `  <url>\n`;
      xml += `    <loc>https://anicrunch.page${url}</loc>\n`;
      xml += `    <changefreq>${url === "" || url === "/schedule.html" ? "daily" : "weekly"}</changefreq>\n`;
      xml += `    <priority>${url === "" ? "1.0" : "0.8"}</priority>\n`;
      xml += `  </url>\n`;
    });

    // Dynamic anime detailed paths
    dbAnime.rows.forEach(row => {
      xml += `  <url>\n`;
      xml += `    <loc>https://anicrunch.page/anime.html?id=${row.anime_id}</loc>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>`;
    res.send(xml);
  } catch (err) {
    console.error("Sitemap generation error:", err);
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://anicrunch.page/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n</urlset>`);
  }
});

/* =====================
   SEO CLEAN URL ROUTING
===================== */
app.get("/anime/:id-:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "anime.html"));
});

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
      ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS genres TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS anime_title TEXT DEFAULT '';
    `);
    
    // Add missing columns to users table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
    `);

    // Create quizzes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options TEXT[] NOT NULL,
        correct_option_index INTEGER NOT NULL,
        difficulty VARCHAR(20) DEFAULT 'medium'
      );
    `);

    // Create user_quiz_stats table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_quiz_stats (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        points INTEGER DEFAULT 0,
        last_played DATE DEFAULT NULL
      );
    `);

    // Create user_quiz_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_quiz_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        played_date DATE NOT NULL,
        score INTEGER NOT NULL,
        UNIQUE(user_id, played_date)
      );
    `);
    
    console.log("✅ Database schema verified/updated");

    // Auto-seed quiz table if empty or has fewer questions than our curated list
    const checkQuiz = await pool.query("SELECT COUNT(*) FROM quizzes");
    console.log(`📊 Quizzes table check: current count is ${checkQuiz.rows[0].count}`);
    
    console.log("🌱 Syncing trivia quizzes pool...");
    const sampleQuizzes = [
      {
        question: "Who is the main protagonist of 'One Piece'?",
        options: ["Roronoa Zoro", "Monkey D. Luffy", "Vinsmoke Sanji", "Portgas D. Ace"],
        correct_option_index: 1
      },
      {
        question: "In 'Naruto', what is the name of the nine-tailed fox sealed inside Naruto?",
        options: ["Gyuki", "Shukaku", "Kurama", "Matatabi"],
        correct_option_index: 2
      },
      {
        question: "Which anime features a notebook that can kill anyone whose name is written in it?",
        options: ["Bleach", "Death Note", "Code Geass", "Attack on Titan"],
        correct_option_index: 1
      },
      {
        question: "What is the name of the giant wall protecting humanity in 'Attack on Titan'?",
        options: ["Wall Maria", "Wall Sina", "Wall Rose", "All of the above"],
        correct_option_index: 3
      },
      {
        question: "In 'Fullmetal Alchemist', what is the ultimate goal of the Elric brothers?",
        options: ["Become State Alchemists", "Find the Philosopher's Stone", "Defeat the Homunculi", "Revive their father"],
        correct_option_index: 1
      },
      {
        question: "Who is known as the 'One Punch Man'?",
        options: ["Genos", "Mumen Rider", "Saitama", "Garou"],
        correct_option_index: 2
      },
      {
        question: "What is the name of the virtual world in the anime 'Sword Art Online'?",
        options: ["Alfheim Online", "Aincrad", "Gun Gale Online", "Underworld"],
        correct_option_index: 1
      },
      {
        question: "In 'Demon Slayer', what breath style does Tanjiro Kamado originally use?",
        options: ["Water Breathing", "Sun Breathing", "Flame Breathing", "Thunder Breathing"],
        correct_option_index: 0
      },
      {
        question: "Which anime features characters using 'Nen' as their primary power system?",
        options: ["Yu Yu Hakusho", "Hunter x Hunter", "My Hero Academia", "Jujutsu Kaisen"],
        correct_option_index: 1
      },
      {
        question: "In 'Jujutsu Kaisen', who is the King of Curses whose fingers Yuji Itadori swallows?",
        options: ["Ryomen Sukuna", "Mahito", "Suguru Geto", "Jogo"],
        correct_option_index: 0
      },
      {
        question: "What is the name of Goku's signature energy blast in 'Dragon Ball'?",
        options: ["Spirit Bomb", "Kamehameha", "Special Beam Cannon", "Galick Gun"],
        correct_option_index: 1
      },
      {
        question: "In 'My Hero Academia', what is All Might's Quirk named?",
        options: ["All for One", "One for All", "Explosion", "Half-Cold Half-Hot"],
        correct_option_index: 1
      },
      {
        question: "Which studio animated the movie 'Spirited Away'?",
        options: ["Studio Trigger", "Studio Ghibli", "Madhouse", "MAPPA"],
        correct_option_index: 1
      },
      {
        question: "In 'Steins;Gate', what is the name of Okabe's time machine?",
        options: ["Phone Microwave", "Time Leap Machine", "FG204", "Ibn 5100"],
        correct_option_index: 0
      },
      {
        question: "What is the primary sport played in the anime 'Haikyu!!'?",
        options: ["Basketball", "Soccer", "Volleyball", "Tennis"],
        correct_option_index: 2
      },
      {
        question: "What is the name of the main artificial human creation method in 'Evangelion'?",
        options: ["Project E", "Human Instrumentality Project", "Magi System", "Terminal Dogma"],
        correct_option_index: 1
      },
      {
        question: "In 'Cowboy Bebop', what is the name of Spike Spiegel's space spaceship?",
        options: ["Bebop", "Swordfish II", "Red Tail", "Hammer Head"],
        correct_option_index: 1
      },
      {
        question: "What power does Lelouch vi Britannia gain in 'Code Geass'?",
        options: ["Telekinesis", "Geass (Absolute Obedience)", "Invisibility", "Pyrokinesis"],
        correct_option_index: 1
      },
      {
        question: "In 'Bleach', what is the name of Ichigo Kurosaki's Zanpakuto?",
        options: ["Senbonzakura", "Zangetsu", "Hyorinmaru", "Tensa Zangetsu"],
        correct_option_index: 1
      },
      {
        question: "What is the name of the organization in 'Spy x Family' that Loid Forger works for?",
        options: ["SSS", "WISE", "Garden", "Ostania Intelligence"],
        correct_option_index: 1
      },
      {
        question: "In 'Tokyo Ghoul', what is Ken Kaneki's favorite book author?",
        options: ["Sen Takatsuki", "Osamu Dazai", "Ryunosuke Akutagawa", "Natsume Soseki"],
        correct_option_index: 0
      },
      {
        question: "What is the name of the academy in 'Kaguya-sama: Love is War'?",
        options: ["Shuchiin Academy", "Otonokizaka Academy", "UA High School", "Hyakkaou Academy"],
        correct_option_index: 0
      },
      {
        question: "In 'JoJo's Bizarre Adventure Part 3', what is Jotaro Kujo's Stand named?",
        options: ["Hermit Purple", "Star Platinum", "The World", "Silver Chariot"],
        correct_option_index: 1
      },
      {
        question: "What is the name of the protagonist in 'Cyberpunk: Edgerunners'?",
        options: ["David Martinez", "Maine", "Lucy", "Falco"],
        correct_option_index: 0
      },
      {
        question: "Which anime film directed by Makoto Shinkai features two teenagers swapping bodies?",
        options: ["Weathering with You", "Your Name", "Suzume", "5 Centimeters per Second"],
        correct_option_index: 1
      },
      {
        question: "In 'Frieren: Beyond Journey's End', who was the hero that Frieren's party accompanied?",
        options: ["Himmel", "Heiter", "Eisen", "Flamme"],
        correct_option_index: 0
      },
      {
        question: "What devil does Denji fuse with in 'Chainsaw Man'?",
        options: ["Gun Devil", "Pochita (Chainsaw Devil)", "Power (Blood Devil)", "Control Devil"],
        correct_option_index: 1
      },
      {
        question: "What is the name of Violet's occupation in 'Violet Evergarden'?",
        options: ["Auto Memory Doll", "State Letter Writer", "Librarian", "Royal Translator"],
        correct_option_index: 0
      },
      {
        question: "In 'No Game No Life', what is the name of the gaming sibling duo?",
        options: ["Sora and Shiro (Blank)", "Lelouch and Nunnally", "Edward and Alphonse", "Killua and Alluka"],
        correct_option_index: 0
      },
      {
        question: "What historical setting is 'Vinland Saga' based on?",
        options: ["Roman Empire", "Viking Age", "Sengoku Period", "French Revolution"],
        correct_option_index: 1
      },
      {
        question: "In 'Mob Psycho 100', what is Mob's real name?",
        options: ["Shigeo Kageyama", "Ritsu Kageyama", "Arataka Reigen", "Teruki Hanazawa"],
        correct_option_index: 0
      },
      {
        question: "Which game does the protagonist play in 'Yu-Gi-Oh!'?",
        options: ["Duel Monsters", "Magic the Gathering", "Vanguard", "Hearthstone"],
        correct_option_index: 0
      },
      {
        question: "In 'Fairy Tail', what kind of magic does Natsu Dragneel use?",
        options: ["Ice-Make Magic", "Fire Dragon Slayer Magic", "Celestial Spirit Magic", "Requip Magic"],
        correct_option_index: 1
      },
      {
        question: "What is the name of the main antagonist in 'Sailor Moon' Part 1?",
        options: ["Queen Beryl", "Queen Nehelenia", "Sailor Galaxia", "Mistress 9"],
        correct_option_index: 0
      },
      {
        question: "In 'Kill la Kill', what is the name of Ryuko Matoi's sentient sailor uniform?",
        options: ["Senketsu", "Junketsu", "Kamui", "Goku Uniform"],
        correct_option_index: 0
      },
      {
        question: "Which anime features a girl named Menma who returns as a ghost to reunite her friends?",
        options: ["Clannad", "Anohana: The Flower We Saw That Day", "Your Lie in April", "Angel Beats!"],
        correct_option_index: 1
      },
      {
        question: "In 'Your Lie in April', what instrument does Kaori Miyazono play?",
        options: ["Piano", "Violin", "Cello", "Flute"],
        correct_option_index: 1
      },
      {
        question: "What is the name of the main setting in 'Made in Abyss'?",
        options: ["The Abyss", "Orth", "The Great Rift", "The Depths"],
        correct_option_index: 0
      },
      {
        question: "In 'The Promised Neverland', what is the name of the orphanage the children live in?",
        options: ["Grace Field House", "Goldy Pond", "Grand Valley", "Glory Bell"],
        correct_option_index: 0
      },
      {
        question: "Which Jojo protagonist has a stand named 'Crazy Diamond'?",
        options: ["Jotaro Kujo", "Josuke Higashikata", "Giorno Giovanna", "Joseph Joestar"],
        correct_option_index: 1
      },
      {
        question: "In 'Black Clover', what is the name of the magic-less boy who wants to become the Wizard King?",
        options: ["Yuno", "Asta", "Noelle", "Yami"],
        correct_option_index: 1
      },
      {
        question: "What is the true identity of L in 'Death Note'?",
        options: ["Light Yagami", "L Lawliet", "Nate River", "Mihael Keehl"],
        correct_option_index: 1
      },
      {
        question: "In 'Re:Zero', what unique ability does Subaru Natsuki possess?",
        options: ["Return by Death", "Absolute Deflection", "Shadow Magic", "Invisibility"],
        correct_option_index: 0
      },
      {
        question: "What is the name of the high school basketball team in 'Kuroko's Basketball'?",
        options: ["Seirin", "Kaijo", "Shutoku", "Touou"],
        correct_option_index: 0
      },
      {
        question: "In 'Overlord', what is the name of the guild founded by Ainz Ooal Gown?",
        options: ["Great Tomb of Nazarick", "Ainz Ooal Gown", "Nine's Own Goal", "Pleiades"],
        correct_option_index: 1
      }
    ];

    let insertedCount = 0;
    for (const q of sampleQuizzes) {
      const exist = await pool.query("SELECT 1 FROM quizzes WHERE question=$1", [q.question]);
      if (exist.rows.length === 0) {
        await pool.query(
          "INSERT INTO quizzes (question, options, correct_option_index) VALUES ($1, $2, $3)",
          [q.question, q.options, q.correct_option_index]
        );
        insertedCount++;
      }
    }
    console.log(`🌱 Seeding complete! Synchronized ${insertedCount} new quizzes. Total count is now ${parseInt(checkQuiz.rows[0].count, 10) + insertedCount}.`);
  } catch (err) {
    console.error("Database migration error:", err);
  }
}
initDB();

// Temporary health check to debug production DB issues
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT 1 as ok");
    res.json({ db: "connected", hasDBUrl: !!process.env.DATABASE_URL, hasSecret: !!process.env.SESSION_SECRET });
  } catch (err) {
    res.json({ db: "error", error: err.message, hasDBUrl: !!process.env.DATABASE_URL, hasSecret: !!process.env.SESSION_SECRET });
  }
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
      "SELECT anime_id, status, progress, score, genres, anime_title FROM watchlists WHERE user_id=$1",
      [req.session.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching watchlist" });
  }
});

app.post("/api/watchlist/add", requireAuth, async (req, res) => {
  const { animeId, genres, title } = req.body;

  try {
    await pool.query(
      "INSERT INTO watchlists (user_id, anime_id, status, progress, genres, anime_title) VALUES ($1, $2, 'plan', 0, $3, $4) ON CONFLICT DO NOTHING",
      [req.session.user.id, animeId, genres || '', title || '']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error adding to watchlist" });
  }
});

app.post("/api/watchlist/update", requireAuth, async (req, res) => {
  const { animeId, status, progress, score, genres, title } = req.body;

  try {
    await pool.query(
      `UPDATE watchlists 
       SET status = COALESCE($3, status), 
           progress = COALESCE($4, progress),
           score = COALESCE($5, score),
           genres = COALESCE($6, genres),
           anime_title = COALESCE($7, anime_title)
       WHERE user_id=$1 AND anime_id=$2`,
      [req.session.user.id, animeId, status, progress, score, genres, title]
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
    
    // Get all watchlist items to calculate statistics
    const statsRes = await pool.query(
      "SELECT anime_id, status, progress, score, genres, anime_title FROM watchlists WHERE user_id=$1",
      [req.session.user.id]
    );
    
    res.json({
      user: userRes.rows[0],
      watchlist: statsRes.rows
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
   QUIZ ROUTES (NEW)
===================== */
app.get("/api/quiz/today", requireAuth, async (req, res) => {
  try {
    const daysSinceEpoch = Math.floor(Date.now() / 86400000);
    
    // Fetch all quiz questions
    const quizzesRes = await pool.query("SELECT id, question, options FROM quizzes ORDER BY id");
    const allQuizzes = quizzesRes.rows;
    
    if (allQuizzes.length === 0) {
      return res.status(404).json({ message: "No quizzes available yet." });
    }
    
    // Pick 3 stable daily questions using index modulo
    const dailyQuestions = [];
    const totalQ = allQuizzes.length;
    for (let i = 0; i < 3; i++) {
      const index = (daysSinceEpoch * 3 + i) % totalQ;
      dailyQuestions.push(allQuizzes[index]);
    }
    
    // Check if user has already played today
    const historyRes = await pool.query(
      "SELECT score FROM user_quiz_history WHERE user_id=$1 AND played_date = CURRENT_DATE",
      [req.session.user.id]
    );
    const alreadyPlayed = historyRes.rows.length > 0;
    const score = alreadyPlayed ? historyRes.rows[0].score : 0;
    
    res.json({
      questions: dailyQuestions,
      alreadyPlayed,
      score
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading daily quiz" });
  }
});

app.post("/api/quiz/submit", requireAuth, async (req, res) => {
  const { answers } = req.body;
  
  if (!Array.isArray(answers)) {
    return res.status(400).json({ message: "Invalid submission format" });
  }
  
  try {
    // Check if already played today
    const historyRes = await pool.query(
      "SELECT * FROM user_quiz_history WHERE user_id=$1 AND played_date = CURRENT_DATE",
      [req.session.user.id]
    );
    
    if (historyRes.rows.length > 0) {
      return res.status(400).json({ message: "You have already completed today's quiz challenge!" });
    }
    
    let correctCount = 0;
    const results = [];
    
    for (const ans of answers) {
      const quizRes = await pool.query("SELECT correct_option_index FROM quizzes WHERE id=$1", [ans.questionId]);
      if (quizRes.rows.length > 0) {
        const correctIdx = quizRes.rows[0].correct_option_index;
        const isCorrect = Number(ans.selectedOptionIndex) === correctIdx;
        if (isCorrect) correctCount++;
        results.push({
          questionId: ans.questionId,
          correct: isCorrect,
          correctOptionIndex: correctIdx
        });
      }
    }
    
    const pointsAwarded = correctCount * 10;
    
    // Update total quiz stats for the user
    await pool.query(
      `INSERT INTO user_quiz_stats (user_id, points, last_played) 
       VALUES ($1, $2, CURRENT_DATE) 
       ON CONFLICT (user_id) DO UPDATE 
       SET points = user_quiz_stats.points + $2,
           last_played = CURRENT_DATE`,
      [req.session.user.id, pointsAwarded]
    );
    
    // Log play in history
    await pool.query(
      "INSERT INTO user_quiz_history (user_id, played_date, score) VALUES ($1, CURRENT_DATE, $2) ON CONFLICT DO NOTHING",
      [req.session.user.id, correctCount]
    );
    
    res.json({
      score: correctCount,
      pointsAwarded,
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error submitting answers" });
  }
});

app.get("/api/quiz/leaderboard", async (req, res) => {
  try {
    const boardRes = await pool.query(`
      SELECT u.username, u.avatar_url, COALESCE(s.points, 0) as points 
      FROM users u
      JOIN user_quiz_stats s ON u.id = s.user_id 
      ORDER BY points DESC, u.username ASC 
      LIMIT 10
    `);
    res.json(boardRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error loading leaderboard" });
  }
});

/* =====================
   START SERVER
===================== */
app.listen(PORT, () => {
  console.log(`✅ anicrunch backend running on port ${PORT}`);
});

# 🎌 AniCrunch: Project Architecture, Technologies & Algorithms Specification

This document details the objective, technology stack, database design, backend/frontend engineering techniques, algorithms, and tools powering **AniCrunch**, a fast and modern anime discovery and tracking platform.

---

## 🎯 1. Project Objective

**AniCrunch** is built to deliver an ultra-fast, feature-rich anime exploration, tracking, and media streaming platform. Unlike bloated modern web apps, AniCrunch emphasizes speed, accessibility, and clean design without relying on heavy client-side JavaScript frameworks.

### Core Goals:
*   **Performance Excellence**: Maintain 90+ Lighthouse performance scores on both desktop and mobile devices.
*   **Complete Custom User Ecosystem**: Secure registration/login, user profile customization, individual watchlists with status/score tracking, and interactive trivia.
*   **Rich Media Discovery**: Streamlined access to MyAnimeList metadata, anime schedules, daily trivia challenges, customizable tier-lists, and integrated theme music players.
*   **SEO Optimization**: Clean, search-engine-friendly URLs, robots configuration, and dynamically generated XML sitemaps.

---

## 🏗️ 2. Technology & Infrastructure Stack

AniCrunch utilizes a full-stack, modular architecture splitting duties between static client services and a dynamic Express API server:

| Tier | Technology / Service | Deployment Platform | Role |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, Vanilla JavaScript | Vercel (Production Hosting) | Client pages, lazy image loaded grid rendering, reactive theme state, interactive tier lists and media controls. |
| **Backend API** | Node.js + Express.js | Render | REST API router managing authorization, watchlist updates, profile storage, trivia score validation, and track sync. |
| **Database** | PostgreSQL (Supabase) | Supabase (Managed Cloud) | Relational database containing users, watchlists, quizzes, track registries, and scoreboard statistics. |
| **Authentication**| bcryptjs + express-session | Server-side Session | Secure session state managed via HttpOnly, SameSite cookies. |
| **Data Sources** | Jikan API v4 & AnimeThemes API | External APIs | Fetches real-time MyAnimeList summaries, schedules, recommendations, and mirror music streaming video/audio links. |

---

## ⚙️ 3. Backend & Frontend Engineering Techniques

*   **FOUC Prevention (Theme Styling)**: An immediate, self-invoking function is injected in the document `<head>` to check `localStorage` for a user's chosen UI theme (e.g., `theme-dark`, `theme-dim`, `theme-light`). Applying this CSS class to `document.documentElement` prior to parsing the body prevents a Flash of Unstyled Content (FOUC).
*   **Intelligent Local API Rate Limiting**: Built a double-queue scheduler (`criticalQueue` and `backgroundQueue`) in frontend JavaScript. This throttles outgoing requests to the public Jikan API (which has strict rate limits), allocating 200ms delays to user interactions and 800ms delays to background loaders.
*   **Database Schema Auto-Migrations**: The server's `initDB()` routine automatically verifies and runs migrations on start. It creates tables (`quizzes`, `user_quiz_stats`, `user_quiz_history`, `music_tracks`), seeds the database, and alters existing schemas to match new properties without manual SQL scripts.
*   **Native Lazy Loading**: Implemented via the browser's `IntersectionObserver` API. Images only load when they scroll into the viewport window offset (with a `100px` root-margin buffer), reducing initial bandwidth and load time.
*   **Clean SEO Routing**: Configured Express to serve clean path parameters (e.g. `/anime/:id-:slug`) while fetching dynamic metadata, and implemented a custom sitemap endpoint that gathers active database entries to build a dynamic `sitemap.xml` listing.

---

## 🧮 4. Core Algorithms & Logic

### A. Stable Question Selection via Epoch Math
The daily trivia quiz features exactly 3 stable questions that change every midnight, synchronized for all users without needing a server-side timer or cron job:
1.  Compute the days since the UNIX epoch:
    $$\text{daysSinceEpoch} = \left\lfloor \frac{\text{Date.now()}}{86400000} \right\rfloor$$
2.  Select 3 stable questions sequentially using an index modulo arithmetic:
    $$\text{index}_i = (\text{daysSinceEpoch} \times 3 + i) \pmod{\text{totalQuestions}}$$

### B. Smart API Retry with Exponential Backoff
When retrieving details from rate-limited endpoints, the network client implements a backoff retry algorithm:
*   Upon receiving an HTTP 429 status code, it delays execution before trying again:
    $$\text{Delay} = \text{backoff} \times 2^{\text{retry\_index}}$$

### C. Regex Path & Filename Sanitization
To facilitate server file uploads (via `multer`) and mirror audio streaming, a regex-based sanitization algorithm strips illegal directory symbols:
```javascript
const sanitize = (str) => str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
```

### D. Secure Password Cryptography
Uses the **Bcrypt** adaptive hashing algorithm with a cost factor (salt rounds) of `10` to securely store user credentials.

---

## 🛠️ 5. Tools & Utilities

*   **Command Line Utilities**: 
    *   `download_themes.js`: Command-line interface tool leveraging Node's `https` module to search MAL, fetch mirror themes from AnimeThemes API, and write files locally.
    *   `sync_themes.js`: Sync utility that connects directly to the Supabase PostgreSQL database to register new mirror streams.
*   **Build & Deployment Controls**: `vercel.json` configures sitemap MIME-types, headers, and clean routing rules.
*   **Database Client**: `pg` (node-postgres) connection pooling manages highly concurrent database connections efficiently.

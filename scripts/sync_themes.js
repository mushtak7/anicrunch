#!/usr/bin/env node
require("dotenv").config();
const { Pool } = require("pg");
const https = require("https");

// Ensure DATABASE_URL is present
if (!process.env.DATABASE_URL) {
  console.error("❌ Error: DATABASE_URL environment variable is missing in your .env file.");
  process.exit(1);
}

// Initialize PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for HTTP requests
async function fetchApi(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchApi(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`API request failed with status: ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse JSON response"));
        }
      });
    }).on("error", reject);
  });
}

// Insert theme registry into Supabase PostgreSQL
async function registerTrack(anime, title, type, url) {
  try {
    // Check if the URL is already registered to avoid duplicates
    const existRes = await pool.query("SELECT 1 FROM music_tracks WHERE url = $1", [url]);
    if (existRes.rows.length > 0) {
      console.log(`  ✨ Theme already registered in database: "${title}"`);
      return;
    }

    await pool.query(
      "INSERT INTO music_tracks (anime, title, type, url) VALUES ($1, $2, $3, $4)",
      [anime, title, type, url]
    );
    console.log(`  ✅ Successfully registered in Supabase: [${anime}] - ${title} [${type}]`);
  } catch (err) {
    console.error(`  ❌ Database insert error for "${title}":`, err.message);
  }
}

// Sync themes for a specific AnimeThemes anime object
async function syncThemesForAnime(animeObj, limitCount = null) {
  const animeName = animeObj.name;
  console.log(`\n📺 Processing anime: "${animeName}"...`);
  
  if (!animeObj.animethemes || animeObj.animethemes.length === 0) {
    console.log(`⚠️ No themes found for "${animeName}" in AnimeThemes database.`);
    return;
  }
  
  // Resolve openings and endings
  let themesToSync = animeObj.animethemes.filter(t => t.type === "OP" || t.type === "ED");
  if (limitCount !== null) {
    themesToSync = themesToSync.slice(0, limitCount);
  }
  
  for (const theme of themesToSync) {
    const type = theme.type;
    const slug = theme.slug; // e.g. OP1, ED1
    
    // Find the first available video mirror link
    const entry = theme.animethemeentries?.[0];
    const video = entry?.videos?.[0];
    const downloadUrl = video?.link;
    
    if (!downloadUrl) {
      console.log(`  ❌ No mirror link found for ${type} (${slug})`);
      continue;
    }
    
    // Clean string values
    const sanitize = (str) => str.replace(/\s+/g, " ").trim();
    
    // Save/register URL directly to Supabase
    await registerTrack(sanitize(animeName), sanitize(slug), type, downloadUrl);
  }
}

// Parse CLI arguments
async function main() {
  const args = process.argv.slice(2);
  let searchIndex = args.indexOf("--search");
  let limitIndex = args.indexOf("--top");
  
  try {
    if (searchIndex !== -1 && args[searchIndex + 1]) {
      const query = args[searchIndex + 1];
      console.log(`🔍 Searching AnimeThemes for "${query}"...`);
      
      const url = `https://api.animethemes.moe/anime?filter[name]=${encodeURIComponent(query)}&include=animethemes.animethemeentries.videos`;
      const res = await fetchApi(url);
      const animeList = res.anime || [];
      if (animeList.length === 0) {
        console.log("❌ No anime matching search query found on AnimeThemes.");
      } else {
        await syncThemesForAnime(animeList[0]);
        console.log("\n🎉 Finished synchronization task.");
      }
    } else if (limitIndex !== -1) {
      const count = parseInt(args[limitIndex + 1], 10) || 5;
      console.log(`🔝 Fetching top ${count} anime list from Jikan (MAL)...`);
      
      let topAnime = [];
      let page = 1;
      while (topAnime.length < count) {
        try {
          const topRes = await fetchApi(`https://api.jikan.moe/v4/top/anime?page=${page}`);
          const pageData = topRes.data || [];
          if (pageData.length === 0) break;
          topAnime = topAnime.concat(pageData);
          page++;
          if (topAnime.length < count) {
            await sleep(1500); // Respect Jikan rate limit
          }
        } catch (err) {
          console.error(`  ⚠️ Failed to fetch page ${page} of top anime:`, err.message);
          break;
        }
      }
      topAnime = topAnime.slice(0, count);
      console.log(`📊 Found ${topAnime.length} popular anime. Resolving metadata sync...`);
      
      for (const malAnime of topAnime) {
        const malId = malAnime.mal_id;
        const animeTitle = malAnime.title_english || malAnime.title;
        console.log(`\n🔗 Syncing theme metadata for MAL ID: ${malId} ("${animeTitle}")`);
        
        try {
          // Resolve MAL ID to AnimeThemes Resource & Anime object
          const resourceRes = await fetchApi(`https://api.animethemes.moe/resource?filter[site]=MyAnimeList&filter[external_id]=${malId}&include=anime`);
          const resources = resourceRes.resources || [];
          const animeInfo = resources[0]?.anime?.[0];
          
          if (animeInfo && animeInfo.slug) {
            // Fetch detailed themes using resolved slug
            const animeRes = await fetchApi(`https://api.animethemes.moe/anime/${animeInfo.slug}?include=animethemes.animethemeentries.videos`);
            const animeObj = animeRes.anime;
            if (animeObj) {
              await syncThemesForAnime(animeObj, 4);
            } else {
              console.log(`  ⚠️ Failed to fetch details for slug: ${animeInfo.slug}`);
            }
          } else {
            console.log(`  ⚠️ No direct mapping found on AnimeThemes for "${animeTitle}" (MAL ID: ${malId})`);
          }
          // Sleep to avoid rate limiting
          await sleep(1500);
        } catch (e) {
          console.error(`  ⚠️ Failed to resolve themes for "${animeTitle}":`, e.message);
        }
      }
      console.log("\n🎉 Finished syncing themes for top popular anime!");
    } else {
      console.log(`
🎧 AniCrunch Supabase Database Theme Syncer Utility
--------------------------------------
Usage:
  node scripts/sync_themes.js --search "<Anime Name>"   - Search and sync themes for a specific anime
  node scripts/sync_themes.js --top <number>            - Automatically sync themes for the top popular anime list

Example:
  node scripts/sync_themes.js --search "Frieren"
  node scripts/sync_themes.js --top 5
`);
    }
  } catch (err) {
    console.error("❌ Process failed:", err.message);
  } finally {
    // Gracefully close database connection pool
    await pool.end();
  }
}

main();

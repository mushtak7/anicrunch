#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const https = require("https");

const MUSIC_DIR = path.join(__dirname, "..", "public", "music");

// Ensure music directory exists
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}

// Helper to sleep/delay (to respect rate limits)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper for HTTP requests that bypasses Cloudflare using a User-Agent
async function fetchApi(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Handle redirect
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

// Downloader helper
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
      }
    };
    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Download failed with status: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    }).on("error", (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Download themes for a specific AnimeThemes anime object
async function downloadThemesForAnime(animeObj, limitCount = null) {
  const animeName = animeObj.name;
  console.log(`\n📺 Processing anime: "${animeName}"...`);
  
  if (!animeObj.animethemes || animeObj.animethemes.length === 0) {
    console.log(`⚠️ No themes found for "${animeName}" in AnimeThemes database.`);
    return;
  }
  
  // Resolve openings and endings
  let themesToDownload = animeObj.animethemes.filter(t => t.type === "OP" || t.type === "ED");
  if (limitCount !== null) {
    themesToDownload = themesToDownload.slice(0, limitCount);
  }
  
  for (const theme of themesToDownload) {
    const type = theme.type; // OP or ED
    const slug = theme.slug; // e.g. OP1, ED1
    
    // Find the first available video mirror link
    const entry = theme.animethemeentries?.[0];
    const video = entry?.videos?.[0];
    const downloadUrl = video?.link;
    
    if (!downloadUrl) {
      console.log(`  ❌ No mirror link found for ${type} (${slug})`);
      continue;
    }
    
    const ext = path.extname(downloadUrl) || ".webm";
    const sanitize = (str) => str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ");
    const filename = `[${sanitize(animeName)}] - ${sanitize(slug)} [${type}]${ext}`;
    const destPath = path.join(MUSIC_DIR, filename);
    
    if (fs.existsSync(destPath)) {
      console.log(`  ✨ Theme already downloaded: ${filename}`);
      continue;
    }
    
    console.log(`  📥 Downloading ${slug} (${type}): "${filename}"...`);
    try {
      await downloadFile(downloadUrl, destPath);
      console.log(`  ✅ Successfully downloaded: ${filename}`);
      // Sleep 1s to be polite
      await sleep(1000);
    } catch (err) {
      console.error(`  ❌ Error downloading theme ${slug}:`, err.message);
    }
  }
}

// Parse CLI arguments
async function main() {
  const args = process.argv.slice(2);
  let searchIndex = args.indexOf("--search");
  let limitIndex = args.indexOf("--top");
  
  if (searchIndex !== -1 && args[searchIndex + 1]) {
    const query = args[searchIndex + 1];
    console.log(`🔍 Searching AnimeThemes for "${query}"...`);
    try {
      const url = `https://api.animethemes.moe/anime?filter[name]=${encodeURIComponent(query)}&include=animethemes.animethemeentries.videos`;
      const res = await fetchApi(url);
      const animeList = res.anime || [];
      if (animeList.length === 0) {
        console.log("❌ No anime matching search query found on AnimeThemes.");
        return;
      }
      
      // Download theme for the first/best match
      await downloadThemesForAnime(animeList[0]);
      console.log("\n🎉 Finished download task.");
    } catch (err) {
      console.error("❌ Search and download process failed:", err.message);
    }
  } else if (limitIndex !== -1) {
    const count = parseInt(args[limitIndex + 1], 10) || 5;
    console.log(`🔝 Fetching top ${count} anime list from Jikan (MAL)...`);
    try {
      const topRes = await fetchApi(`https://api.jikan.moe/v4/top/anime?limit=${count}`);
      const topAnime = topRes.data || [];
      console.log(`📊 Found ${topAnime.length} popular anime. Resolving mirror downloads...`);
      
      for (const malAnime of topAnime) {
        const malId = malAnime.mal_id;
        const animeTitle = malAnime.title_english || malAnime.title;
        console.log(`\n🔗 Syncing theme metadata for MAL ID: ${malId} ("${animeTitle}")`);
        
        try {
          // Step 1: Resolve MAL ID to AnimeThemes Resource & Anime object
          const resourceRes = await fetchApi(`https://api.animethemes.moe/resource?filter[site]=MyAnimeList&filter[external_id]=${malId}&include=anime`);
          const resources = resourceRes.resources || [];
          const animeInfo = resources[0]?.anime?.[0];
          
          if (animeInfo && animeInfo.slug) {
            // Step 2: Fetch detailed themes using the resolved slug
            const animeRes = await fetchApi(`https://api.animethemes.moe/anime/${animeInfo.slug}?include=animethemes.animethemeentries.videos`);
            const animeObj = animeRes.anime;
             if (animeObj) {
               await downloadThemesForAnime(animeObj, 4);
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
      console.log("\n🎉 Finished downloading themes for top popular anime!");
    } catch (err) {
      console.error("❌ Failed to fetch top anime lists:", err.message);
    }
  } else {
    // Help / default usage info
    console.log(`
🎧 AniCrunch Theme Downloader Utility
--------------------------------------
Usage:
  node scripts/download_themes.js --search "<Anime Name>"   - Search and download themes for a specific anime
  node scripts/download_themes.js --top <number>            - Automatically download themes for the top popular anime list

Example:
  node scripts/download_themes.js --search "Frieren"
  node scripts/download_themes.js --top 5
`);
  }
}

main();

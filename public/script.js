// =====================
// API CONFIGURATION
// =====================
const API_BASE = "https://anicrunch-backend.onrender.com";

// =====================
// GLOBAL STATE
// =====================
const appState = {
  cache: new Map(),
  viewState: {
    mode: 'home', 
    currentQuery: '',
    currentPage: 1,
    isLoading: false,
    hasMore: true
  },
  intervals: {
    hero: null
  },
  preferences: {
    cardsPerPage: 6
  }
};

// =====================
// UTILITIES
// =====================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => { func(...args); };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Frontend Cache
function cacheResponse(key, data, ttl = 300000) {
  appState.cache.set(key, { data, expires: Date.now() + ttl });
}

function getCached(key) {
  const cached = appState.cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (cached) appState.cache.delete(key);
  return null;
}

function getElement(id) {
  return document.getElementById(id);
}

// =====================
// FETCH WITH RETRY (Prevents API Bans)
// =====================
async function fetchWithRetry(url, retries = 3, backoff = 1000) {
  const cached = getCached(url);
  if (cached) return cached;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { // Rate limit hit
        console.warn(`Rate limit hit for ${url}. Waiting ${backoff}ms...`);
        await delay(backoff * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const json = await res.json();
      const data = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : []);
      
      if (data.length > 0) cacheResponse(url, data);
      return data;
    } catch (e) {
      if (i === retries - 1) throw e;
      await delay(backoff);
    }
  }
  return [];
}

// =====================
// LAZY LOADING
// =====================
const imageObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.classList.add('loaded');
        observer.unobserve(img);
      }
    }
  });
}, { rootMargin: '100px', threshold: 0.01 });

// =====================
// CARD CREATOR
// =====================
function createCard(anime) {
  const div = document.createElement("div");
  div.className = "anime-card";
  div.setAttribute('role', 'button');
  
  const imgUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const title = anime.title || "Untitled";
  const score = anime.score || 'N/A';
  const year = anime.year || 'Unknown';
  const type = anime.type || 'TV';

  div.innerHTML = `
    <div style="position: relative; width: 100%; padding-top: 145%;">
      <img data-src="${imgUrl}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 4'%3E%3C/svg%3E" 
           alt="${title}" class="lazy-img"
           style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;">
      <div style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.7); color: #fbbf24; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">
        ⭐ ${score}
      </div>
    </div>
    <div style="padding: 10px; flex-grow: 1; display: flex; flex-direction: column;">
      <h3 style="font-size: 0.9rem; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #fff;">
        ${title}
      </h3>
      <div style="margin-top: auto; padding-top: 6px; font-size: 0.75rem; color: #aaa;">
        ${year} • ${type}
      </div>
    </div>
  `;
  
  div.onclick = () => {
    if (anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`;
  };
  
  const img = div.querySelector('img');
  if (img) imageObserver.observe(img);
  
  return div;
}

// =====================
// MAIN APP LOGIC
// =====================
document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const heroBg = getElement("heroBg");
  const heroTitle = getElement("heroTitle");
  const heroMeta = getElement("heroMeta");
  const heroSynopsis = getElement("heroSynopsis");
  const heroGenres = getElement("heroGenres");
  const heroWatchlist = getElement("heroWatchlist");
  const heroDetails = getElement("heroDetails");
  const heroDots = document.querySelectorAll(".hero-dot");
  const seasonalBox = getElement("seasonal");
  const trendingBox = getElement("trending");
  const topBox = getElement("topAnime");
  const authArea = getElement("authArea");
  
  // Search Elements
  const searchInput = getElement("search");
  const resultsBox = getElement("animeContainer");
  const searchBlock = getElement("searchBlock");
  const searchClear = getElement("searchClear");
  const leftCol = document.querySelector(".left");

  let heroAnimes = [];
  let currentHeroIndex = 0;
  let currentSearchAbortController = null;
  
  const carousels = {
    seasonal: { currentPage: 0, totalCards: 0 },
    trending: { currentPage: 0, totalCards: 0 }
  };
  const CARDS_PER_PAGE = 6;

  // --- AUTH CHECK ---
  fetch(`${API_BASE}/api/me`, { credentials: "include" })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => {
      if (d.user && authArea) {
        authArea.innerHTML = `
          <a href="/watchlist.html" class="auth-link">📚 Watchlist</a>
          <span class="user-name">👤 ${d.user.username}</span>
          <button class="auth-link" onclick="logout()">Logout</button>
        `;
      }
    }).catch(() => {});

  window.logout = () => {
    fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "include" })
      .then(() => location.reload());
  };

  // --- SEARCH LOGIC ---
  const handleSearch = debounce(async (query) => {
    if (searchClear) searchClear.style.display = query.length > 0 ? 'block' : 'none';

    // Redirect if not on home page
    if (!resultsBox) {
      if (query.length >= 3) window.location.href = `/?search=${encodeURIComponent(query)}`;
      return;
    }

    if (query.length < 3) {
      if (appState.viewState.mode === 'search') resetToHome();
      return;
    }

    if (currentSearchAbortController) currentSearchAbortController.abort();
    currentSearchAbortController = new AbortController();

    // UI Updates
    const hero = getElement("hero");
    if (hero) hero.style.display = 'none';
    if (searchBlock) searchBlock.style.display = "block";
    if (seasonalBox) seasonalBox.parentElement.style.display = "none";
    if (trendingBox) trendingBox.parentElement.style.display = "none";

    resultsBox.innerHTML = `<div class="loading">Searching "${query}"...</div>`;

    try {
      // 1. Backend Search (Try first)
      let data = [];
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, {
          signal: currentSearchAbortController.signal, credentials: "include"
        });
        if (res.ok) {
          const json = await res.json();
          data = Array.isArray(json.data) ? json.data : [];
        }
      } catch (_) {}

      // 2. Fallback Jikan (If backend fails or returns empty)
      if (!data.length) {
        const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=24`, {
          signal: currentSearchAbortController.signal
        });
        const json = await res.json();
        data = json.data || [];
      }

      resultsBox.innerHTML = `<div class="filter-header" style="margin-bottom:20px"><h2>🔍 Results for "${query}"</h2></div>`;
      
      if (!data.length) {
        resultsBox.innerHTML += `<div class="empty-state"><p>No results found.</p></div>`;
        return;
      }

      renderAnimeGrid(resultsBox, data);

    } catch (err) {
      if (err.name !== "AbortError") {
        resultsBox.innerHTML = `<div class="empty-state"><p>Search failed</p></div>`;
      }
    }
  }, 500);

  if (searchInput) {
    searchInput.oninput = (e) => handleSearch(e.target.value.trim());
    if (searchClear) searchClear.onclick = () => { searchInput.value = ''; resetToHome(); };
    
    // Check URL params
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    if (searchParam) {
      searchInput.value = searchParam;
      handleSearch(searchParam);
    }
  }

  function resetToHome() {
    appState.viewState.mode = 'home';
    const hero = getElement("hero");
    if (hero) hero.style.display = 'flex';
    if (searchBlock) searchBlock.style.display = 'none';
    if (seasonalBox) seasonalBox.parentElement.style.display = 'block';
    if (trendingBox) trendingBox.parentElement.style.display = 'block';
    if (resultsBox) resultsBox.innerHTML = '';
    if (searchClear) searchClear.style.display = 'none';
    history.replaceState({}, document.title, window.location.pathname);
  }

  // --- HERO LOGIC ---
  function updateHero(anime) {
    if (!anime) return;
    
    if (heroBg) {
      heroBg.style.opacity = "0";
      setTimeout(() => {
        heroBg.style.backgroundImage = `url('${anime.images?.jpg?.large_image_url}')`;
        heroBg.style.opacity = "1";
      }, 300);
    }

    if (heroTitle) heroTitle.textContent = anime.title;
    if (heroMeta) heroMeta.innerHTML = `⭐ ${anime.score || "N/A"} • ${anime.episodes || "?"} eps`;
    if (heroSynopsis) {
      const syn = anime.synopsis || "No synopsis available.";
      heroSynopsis.textContent = syn.length > 180 ? syn.substring(0, 180) + "..." : syn;
    }
    
    if (heroGenres) {
      heroGenres.innerHTML = "";
      (anime.genres || []).slice(0, 3).forEach(g => {
        const span = document.createElement("span");
        span.textContent = g.name;
        heroGenres.appendChild(span);
      });
    }

    if (heroDetails) heroDetails.onclick = () => location.href = `/anime.html?id=${anime.mal_id}`;

    if (heroWatchlist) {
      heroWatchlist.innerText = '+ Add to Watchlist';
      heroWatchlist.disabled = false;
      heroWatchlist.classList.remove('added');
      heroWatchlist.onclick = () => {
        heroWatchlist.innerText = 'Adding...';
        heroWatchlist.disabled = true;
        fetch(`${API_BASE}/api/watchlist/add`, {
          method: "POST", 
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ animeId: Number(anime.mal_id) })
        }).then(res => {
          if (res.ok) {
            heroWatchlist.innerText = '✓ Added!';
            heroWatchlist.classList.add('added');
          } else {
             location.href = '/login.html';
          }
        }).catch(() => {
          heroWatchlist.innerText = 'Error';
          heroWatchlist.disabled = false;
        });
      };
    }

    heroDots.forEach((dot, i) => dot.classList.toggle("active", i === currentHeroIndex));
  }

  function goToHero(index) {
    if (!heroAnimes.length) return;
    currentHeroIndex = ((index % heroAnimes.length) + heroAnimes.length) % heroAnimes.length;
    updateHero(heroAnimes[currentHeroIndex]);
    resetHeroTimer();
  }

  function resetHeroTimer() {
    clearInterval(appState.intervals.hero);
    appState.intervals.hero = setInterval(() => goToHero(currentHeroIndex + 1), 8000);
  }

  heroDots.forEach((dot, i) => dot.onclick = () => goToHero(i));
  const prevBtn = document.querySelector(".hero-arrow.left");
  const nextBtn = document.querySelector(".hero-arrow.right");
  if (prevBtn) prevBtn.onclick = () => goToHero(currentHeroIndex - 1);
  if (nextBtn) nextBtn.onclick = () => goToHero(currentHeroIndex + 1);

  async function loadHero() {
    try {
      const data = await fetchWithRetry("https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=7");
      if (data && data.length > 0) {
        heroAnimes = data;
        updateHero(data[0]);
        resetHeroTimer();
      }
    } catch (e) { console.error(e); }
  }

  // --- CAROUSEL LOGIC ---
  async function loadSection(id, url) {
    const box = getElement(id);
    if (!box) return;
    try {
      const data = await fetchWithRetry(url);
      box.innerHTML = "";
      carousels[id] = { currentPage: 0, totalCards: data.length };
      data.forEach(a => {
        const card = createCard(a);
        card.style.display = 'none';
        box.appendChild(card);
      });
      updateCarousel(id);
    } catch(e) { box.innerHTML = '<div class="error-state">Failed to load</div>'; }
  }

  function updateCarousel(id) {
    const container = getElement(id);
    const state = carousels[id];
    if (!container || !state) return;
    const cards = container.querySelectorAll(".anime-card");
    const totalPages = Math.ceil(state.totalCards / CARDS_PER_PAGE);
    cards.forEach((card, index) => {
      const start = state.currentPage * CARDS_PER_PAGE;
      const end = start + CARDS_PER_PAGE;
      card.style.display = (index >= start && index < end) ? "flex" : "none";
    });
    const wrapper = container.closest(".row-wrapper");
    if (wrapper) {
      wrapper.querySelector(".nav-btn.left").disabled = state.currentPage <= 0;
      wrapper.querySelector(".nav-btn.right").disabled = state.currentPage >= totalPages - 1;
    }
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.target;
      const dir = btn.classList.contains("left") ? -1 : 1;
      const state = carousels[id];
      if (state) {
        state.currentPage += dir;
        updateCarousel(id);
      }
    };
  });

  // --- TOP ANIME ---
  async function loadTopAnime() {
    if (!topBox) return;
    const data = await fetchWithRetry("https://api.jikan.moe/v4/top/anime?sfw=true&limit=10");
    topBox.innerHTML = "";
    data.forEach((a, i) => {
      const div = document.createElement("div");
      div.className = "top-item";
      div.innerHTML = `
        <span class="rank">#${i + 1}</span>
        <img src="${a.images?.jpg?.image_url}" style="width:50px; height:70px; object-fit:cover; border-radius:4px;">
        <div class="top-item-info" style="margin-left:10px;">
          <span class="top-title" style="display:block; font-weight:bold;">${a.title}</span>
          <span class="top-score">⭐ ${a.score || "N/A"}</span>
        </div>
      `;
      div.onclick = () => location.href = `/anime.html?id=${a.mal_id}`;
      topBox.appendChild(div);
    });
  }

  // --- GENRE LOGIC ---
  const genreChips = getElement("genreChips");
  if (genreChips) {
    const genres = [
      { id: 1, name: 'Action', icon: '⚔️' }, { id: 2, name: 'Adventure', icon: '🗺️' },
      { id: 4, name: 'Comedy', icon: '😂' }, { id: 8, name: 'Drama', icon: '🎭' },
      { id: 10, name: 'Fantasy', icon: '🧙' }, { id: 14, name: 'Horror', icon: '👻' },
      { id: 22, name: 'Romance', icon: '💕' }, { id: 24, name: 'Sci-Fi', icon: '🚀' },
      { id: 30, name: 'Sports', icon: '⚽' }, { id: 36, name: 'Slice of Life', icon: '🌸' }
    ];
    
    genreChips.innerHTML = `<button class="genre-chip active" onclick="location.reload()">✨ All</button>`;
    genres.forEach(g => {
      genreChips.innerHTML += `<button class="genre-chip" onclick="filterByGenre(${g.id}, '${g.name}')">${g.icon} ${g.name}</button>`;
    });
  }

  // --- INITIAL LOAD SEQUENCE (SLOWED DOWN FOR STABILITY) ---
  if (seasonalBox) {
    (async () => {
      await loadHero();
      await delay(1200); // ⚠️ FIX: Slower delay (1.2s) prevents API Ban
      await loadSection("seasonal", "https://api.jikan.moe/v4/seasons/now?sfw=true&limit=25");
      await delay(1200); // ⚠️ FIX: Slower delay (1.2s)
      await loadSection("trending", "https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=25");
      await delay(1200); // ⚠️ FIX: Slower delay (1.2s)
      await loadTopAnime();
    })();
  }
});

// =====================
// GLOBAL FUNCTIONS (ACCESSIBLE BY HTML)
// =====================

// 1. GENRE FILTER
async function filterByGenre(id, name) {
  const hero = getElement("hero");
  const leftCol = document.querySelector(".left");
  const searchBlock = getElement("searchBlock");
  const resultsBox = getElement("animeContainer");

  if (hero) hero.style.display = 'none';
  if (leftCol) Array.from(leftCol.children).forEach(c => c.style.display = c.id === 'searchBlock' ? 'block' : 'none');
  if (searchBlock) searchBlock.style.display = 'block';

  resultsBox.innerHTML = `<div class="filter-header"><h2>🎭 ${name} Anime</h2></div><div class="loading">Loading...</div>`;
  
  try {
    const data = await fetchWithRetry(`https://api.jikan.moe/v4/anime?genres=${id}&order_by=popularity&sfw=true&limit=24`);
    renderAnimeGrid(resultsBox, data);
  } catch (e) {
    resultsBox.innerHTML = `<div class="error-state">Failed to load genre</div>`;
  }
}

// 2. RENDER GRID HELPER
function renderAnimeGrid(container, data) {
  container.innerHTML = '';
  // Re-add header if it was cleared
  if(!container.querySelector('.filter-header')) {
     // Optional: restore header logic if needed
  }
  
  const grid = document.createElement('div');
  grid.style.cssText = "display:grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap:20px;";
  data.forEach(anime => grid.appendChild(createCard(anime)));
  container.appendChild(grid);
}

// 3. SPIN WHEEL (RANDOM) - NOW EXPLICITLY ATTACHED TO WINDOW
async function spinWheel() {
  let overlay = getElement('spinOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'spinOverlay';
    overlay.className = 'spin-overlay';
    overlay.innerHTML = `<div class="spinner-content"><div class="big-spinner">🎲</div><h3 style="color:white">Finding anime...</h3></div>`;
    document.body.appendChild(overlay);
  }
  
  overlay.classList.add('active');

  try {
    await delay(1000); // Effect delay
    const res = await fetch('https://api.jikan.moe/v4/random/anime?sfw=true');
    const json = await res.json();
    const anime = json.data;

    if (anime && anime.mal_id) {
      location.href = `/anime.html?id=${anime.mal_id}`;
    } else {
      throw new Error('No data');
    }
  } catch (e) {
    alert("Could not fetch random anime. Please try again.");
    overlay.classList.remove('active');
  }
}
window.spinWheel = spinWheel; // ⚠️ FIX: Makes the HTML button work

// 4. LOAD SCHEDULE
async function loadSchedule(day) {
  const grid = getElement('scheduleGrid');
  if (!grid) return;

  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  day = (day || '').toLowerCase().trim();
  if (!validDays.includes(day)) return;

  document.querySelectorAll('.day-btn').forEach(b => {
    b.classList.toggle('active', b.innerText.toLowerCase().includes(day.substring(0,3)));
  });

  grid.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const data = await fetchWithRetry(`https://api.jikan.moe/v4/schedules?filter=${day}&sfw=true`);
    grid.innerHTML = '';
    
    if(!data.length) {
      grid.innerHTML = '<div class="empty-state">No anime airing today</div>';
      return;
    }

    const gridDiv = document.createElement('div');
    gridDiv.style.cssText = "display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:20px;";
    
    data.forEach(anime => {
      const card = document.createElement('div');
      card.className = 'schedule-card';
      card.innerHTML = `
        <img src="${anime.images?.jpg?.image_url}" class="schedule-img">
        <div class="schedule-info">
          <div class="time-badge">⏰ ${anime.broadcast?.time || 'TBA'}</div>
          <div class="schedule-title">${anime.title}</div>
        </div>
      `;
      card.onclick = () => location.href = `/anime.html?id=${anime.mal_id}`;
      gridDiv.appendChild(card);
    });
    grid.appendChild(gridDiv);
  } catch(e) {
    grid.innerHTML = '<div class="error-state">Failed to load schedule</div>';
  }
}
window.loadSchedule = loadSchedule; // ⚠️ FIX: Makes the HTML button work

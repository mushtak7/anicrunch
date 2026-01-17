// =====================
// API CONFIGURATION
// =====================
const API_BASE = "https://anicrunch-backend.onrender.com";

// =====================
// GLOBAL STATE
// =====================
const appState = {
  cache: new Map(),
  recentSearches: [],
  preferences: {
    cardsPerPage: 6
  },
  viewState: {
    mode: 'home', 
    currentQuery: '',
    currentPage: 1,
    isLoading: false,
    hasMore: true
  },
  intervals: {
    hero: null
  }
};

// =====================
// CURATED LISTS DATA
// =====================
const curatedLists = {
  mustWatch: [
    { id: 9253, note: "Smart, emotional sci-fi that respects the viewer." }, // Steins;Gate
    { id: 16498, note: "A landmark series that changed modern anime." }, // AoT
    { id: 5114, note: "A complete story with strong themes and payoff." }, // FMAB
    { id: 1535, note: "Stylish, timeless, and deeply influential." }, // Death Note
    { id: 52991, note: "Quiet fantasy with emotional depth." } // Frieren
  ],

  hiddenGems: [
    { id: 48849, note: "Abstract storytelling that demands attention." }, // Sonny Boy
    { id: 6211, note: "Character-driven sports anime with unique art." }, // Ping Pong
    { id: 387, note: "Atmospheric and philosophical sci-fi." }, // Haibane Renmei
    { id: 457, note: "Slow, reflective, and deeply calming." } // Mushishi
  ],

  topTen: [
    { id: 9253 }, // Steins;Gate
    { id: 16498 }, // AoT
    { id: 48849 }, // Sonny Boy
    { id: 44511 }, // Chainsaw Man
    { id: 14813 }, // Oregairu
    { id: 10087 }, // Fate/Zero
    { id: 52991 }, // Frieren
    { id: 20 }, // Naruto
    { id: 21 }, // One Piece
    { id: 16067 } // Railgun
  ]
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

// Global Rate Limiter for Jikan API
let requestQueue = Promise.resolve();

function queuedFetch(url) {
  // Chain requests to ensure they run one by one
  requestQueue = requestQueue.then(async () => {
    await delay(450); // 450ms delay prevents 429 Rate Limit
    return fetchWithRetry(url);
  });
  return requestQueue;
}

// Skeleton Generator
function createSkeletonCard() {
  const div = document.createElement("div");
  div.className = "anime-card skeleton-card skeleton";
  div.innerHTML = `
    <div class="skeleton-title"></div>
    <div class="skeleton-text"></div>
    <div class="skeleton-text" style="width:60%"></div>
  `;
  return div;
}

// =====================
// UI HELPERS
// =====================
function resetContainerLayout(container) {
  if (!container) return;
  container.style.display = "block";
  container.style.width = "100%";
}

function renderAnimeGrid(container, animeList, append = false) {
  if (!container) return;
  
  resetContainerLayout(container);
  
  const loader = container.querySelector('.loading');
  if (loader) loader.remove();

  let grid = container.querySelector('.responsive-grid');
  if (!grid) {
    grid = document.createElement('div');
    grid.className = 'responsive-grid';
    grid.style.cssText = `
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) !important;
      gap: 20px !important;
      width: 100% !important;
      margin-top: 20px !important;
    `;
    container.appendChild(grid);
  } else if (!append) {
    grid.innerHTML = '';
  }

  animeList.forEach(anime => {
    const card = createCard(anime);
    card.style.width = '100%';
    card.style.height = '100%'; 
    grid.appendChild(card);
  });
}

function renderLoadMoreButton(container, onClick) {
  if (!container) return;
  
  const existing = container.querySelector('.load-more-container');
  if (existing) existing.remove();

  const btnContainer = document.createElement('div');
  btnContainer.className = 'load-more-container';
  btnContainer.style.cssText = `width: 100%; display: flex; justify-content: center; padding: 30px 0 50px 0;`;
  
  const btn = document.createElement('button');
  btn.innerText = '⬇ Load More';
  btn.style.cssText = `padding: 12px 30px; background: #3b82f6; color: white; border: none; border-radius: 50px; cursor: pointer; font-weight: bold; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);`;
  
  btn.onmouseover = () => { btn.style.transform = 'scale(1.05)'; };
  btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };
  
  btn.onclick = () => {
    btn.innerText = '⏳ Loading...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    onClick(btn);
  };
  
  btnContainer.appendChild(btn);
  container.appendChild(btnContainer);
}

// =====================
// FETCH (Smart Retry + Unwrapping Fix)
// =====================
async function fetchWithRetry(url, retries = 3, backoff = 1000) {
  const cached = getCached(url);
  if (cached) return cached;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Severe backoff if we hit rate limit despite queue
        await delay(backoff * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseError) {
        throw new Error('Invalid JSON response');
      }
      
      // [CRITICAL FIX] Unwraps and caches data correctly
      if (Array.isArray(json.data)) {
        // It's a list: return the array directly
        const data = json.data;
        if (data.length > 0) cacheResponse(url, data);
        return data;
      } else if (json.data) {
        // It's a single item: cache ONLY the anime object
        cacheResponse(url, json.data);
        return json.data;
      }
      
      return [];
    } catch (e) {
      if (i === retries - 1) throw e;
      await delay(backoff);
    }
  }
  return [];
}

// =====================
// LAZY LOADING (Safe Guarded)
// =====================
// [CRITICAL FIX] Guard IntersectionObserver for older browsers
const imageObserver = "IntersectionObserver" in window 
  ? new IntersectionObserver((entries, observer) => {
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
    }, { rootMargin: '100px', threshold: 0.01 })
  : null;

function cleanupObserver() {
  if (imageObserver) imageObserver.disconnect();
}

// =====================
// CARD CREATOR
// =====================
function createCard(anime, options = {}) { 
  const div = document.createElement("div");
  div.className = "anime-card";
  div.setAttribute('tabindex', '0');
  div.setAttribute('role', 'button');
  div.setAttribute('aria-label', `View details for ${anime.title || 'Untitled'}`);
  
  const imgUrl = anime.images?.jpg?.large_image_url || 
                 anime.images?.jpg?.image_url || 
                 "https://via.placeholder.com/300x420?text=No+Image";

  const title = anime.title || "Untitled";
  const score = anime.score || 'N/A';
  const year = anime.year || 'Unknown';
  const type = anime.type || 'TV';
  
  div.style.cssText = `display: flex; flex-direction: column; overflow: hidden; position: relative; cursor: pointer;`;

  div.innerHTML = `
    <div style="position: relative; width: 100%; padding-top: 145%;">
      <img data-src="${imgUrl}" 
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 4'%3E%3C/svg%3E" 
           alt="${title}" 
           style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
           class="lazy-img">
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
  
  const navigateToAnime = () => {
    if (anime.mal_id) {
      location.href = `/anime.html?id=${anime.mal_id}`;
    }
  };
  
  div.onclick = navigateToAnime;
  div.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToAnime();
    }
  };
  
  const img = div.querySelector('img');
  if (img) {
    if (imageObserver && !options.disableLazy) {
      imageObserver.observe(img);
    } else {
      // Fallback: load immediately if disabled or no observer
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
      img.classList.add('loaded');
    }
  }
  
  return div;
}

// =====================
// MAIN APP LOGIC
// =====================
document.addEventListener("DOMContentLoaded", () => {
  const seasonalBox = getElement("seasonal");
  const trendingBox = getElement("trending");
  const topBox = getElement("topAnime");
  const resultsBox = getElement("animeContainer");
  const searchBlock = getElement("searchBlock");
  const searchInput = getElement("search");
  const searchClear = getElement("searchClear");
  const authArea = getElement("authArea");
  const hero = getElement("hero");
  const genreChips = getElement("genreChips");
  
  const recommendsPreview = getElement("recommendsPreview");
  const homeSections = getElement("homeSections");

  // Hero Elements
  const heroBg = getElement("heroBg");
  const heroTitle = getElement("heroTitle");
  const heroMeta = getElement("heroMeta");
  const heroSynopsis = getElement("heroSynopsis");
  const heroGenres = getElement("heroGenres");
  const heroWatchlist = getElement("heroWatchlist");
  const heroDetails = getElement("heroDetails");
  const heroDots = document.querySelectorAll(".hero-dot");
  const heroArrowLeft = document.querySelector(".hero-arrow.left");
  const heroArrowRight = document.querySelector(".hero-arrow.right");

  if (heroBg) {
    heroBg.style.filter = "none";
    heroBg.style.backdropFilter = "none";
    heroBg.style.transform = "none"; 
  }

  let heroAnimes = [];
  let currentHeroIndex = 0;
  let currentSearchAbortController = null;
  
  const carousels = {
    seasonal: { currentPage: 0, totalCards: 0 },
    trending: { currentPage: 0, totalCards: 0 }
  };
  const CARDS_PER_PAGE = appState.preferences.cardsPerPage;

  function showHome() {
    appState.viewState.mode = 'home';
    if (homeSections) homeSections.style.display = "block";
    if (hero) hero.style.display = "flex";
    if (searchBlock) searchBlock.style.display = "none";
    if (resultsBox) resultsBox.innerHTML = "";
    if (searchClear) searchClear.style.display = "none";
  }

  function showResults() {
    if (homeSections) homeSections.style.display = "none";
    if (hero) hero.style.display = "none";
    if (searchBlock) searchBlock.style.display = "block";
  }

  // Auth (Backend API - uses raw fetch)
  fetch(`${API_BASE}/api/me`, { credentials: "include" })
    .then(r => r.ok ? r.json() : Promise.reject('Not authenticated'))
    .then(d => {
      if (d.user && authArea) {
        authArea.innerHTML = `
          <a href="/watchlist.html" class="auth-link">📚 Watchlist</a>
          <span class="user-name">👤 ${d.user.username}</span>
          <button class="auth-link" onclick="logout()">Logout</button>
        `;
      }
    }).catch(() => {});

  window.logout = function() {
    fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "include" })
      .then(() => location.reload()).catch(() => location.reload());
  };

  // Search
  const handleSearch = debounce(async (query) => {
    if (searchClear) searchClear.style.display = query.length > 0 ? 'block' : 'none';
    if (!resultsBox) {
      if (query.length >= 3) {
        appState.viewState.mode = 'search'; 
        window.location.href = `/?search=${encodeURIComponent(query)}`;
      }
      return;
    }
    if (query.length < 3) {
      if (appState.viewState.mode === 'search') resetToHome();
      return;
    }
    showResults();
    if (currentSearchAbortController) currentSearchAbortController.abort();
    currentSearchAbortController = new AbortController();

    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    appState.viewState = { mode: 'search', currentQuery: query, currentPage: 1, isLoading: true, hasMore: true };

    resultsBox.innerHTML = `
      <div class="filter-header" style="margin-bottom: 20px;">
        <h2>🔍 Results for "${escapeHtml(query)}"</h2>
      </div>
      <div class="loading">Searching...</div>
    `;
    await loadSearchPage(query);
  }, 300);

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadSearchPage(query, btnElement = null) {
    if (!resultsBox) return;
    try {
      let data = [];
      try {
        // Backend Search
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`, {
          signal: currentSearchAbortController.signal,
          credentials: "include"
        });
        if (res.ok) {
          const json = await res.json();
          data = Array.isArray(json.data) ? json.data : [];
        }
      } catch (_) {}

      if (!data.length) {
        // [FIX] Jikan Fallback via queuedFetch
        const jikanData = await queuedFetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=24`);
        data = Array.isArray(jikanData) ? jikanData : [];
      }

      resultsBox.innerHTML = `
        <div class="filter-header" style="margin-bottom:20px">
          <h2>🔍 Results for "${escapeHtml(query)}"</h2>
        </div>
      `;
      if (!data.length) {
        resultsBox.innerHTML += `<div class="empty-state"><p>No results found.</p></div>`;
        return;
      }
      renderAnimeGrid(resultsBox, data);
    } catch (err) {
      if (err.name === "AbortError") return;
      resultsBox.innerHTML = `<div class="empty-state"><p>⚠️ Failed to load search results</p></div>`;
      console.error(err);
    }
  }

  function resetToHome() {
    appState.viewState = { mode: 'home', currentQuery: '', currentPage: 1, isLoading: false, hasMore: true };
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    const allChip = document.querySelector('.genre-chip');
    if (allChip) allChip.classList.add('active'); 
    if (searchInput) searchInput.value = '';
    showHome();
    if (window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (searchInput) {
    searchInput.oninput = (e) => handleSearch(e.target.value.trim());
    searchInput.onkeydown = (e) => { 
      if (e.key === 'Escape') { e.preventDefault(); searchClear.click(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstCard = resultsBox ? resultsBox.querySelector('.anime-card') : null;
        if (firstCard && appState.viewState.mode === 'search') firstCard.click();
      }
    };
  }

  if (searchClear) {
    searchClear.onclick = () => {
      if (searchInput) { searchInput.value = ''; searchInput.focus(); }
      resetToHome();
      loadAllData();
    };
  }

  // Hero Functions
  function updateHero(anime) {
    if (!anime) return;
    if (heroBg) {
      heroBg.style.opacity = "0";
      setTimeout(() => {
        heroBg.style.backgroundImage = `url('${anime.images?.jpg?.large_image_url || ''}')`;
        heroBg.style.opacity = "1";
      }, 300);
    }
    if (heroTitle) heroTitle.textContent = anime.title || 'Unknown Title';
    if (heroMeta) heroMeta.innerHTML = `⭐ ${anime.score || "N/A"} • ${anime.episodes || "?"} eps`;
    if (heroSynopsis) {
      const synopsis = anime.synopsis || "No synopsis available.";
      heroSynopsis.textContent = synopsis.length > 180 ? synopsis.substring(0, 180) + "..." : synopsis;
    }
    if (heroGenres) {
      heroGenres.innerHTML = "";
      (anime.genres || []).slice(0, 3).forEach(g => {
        const span = document.createElement("span");
        span.textContent = g.name;
        heroGenres.appendChild(span);
      });
    }
    if (heroWatchlist) {
      heroWatchlist.innerText = '+ Add to Watchlist';
      heroWatchlist.disabled = false;
      heroWatchlist.onclick = () => {
        heroWatchlist.innerText = 'Adding...';
        heroWatchlist.disabled = true;
        fetch(`${API_BASE}/api/watchlist/add`, {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ animeId: Number(anime.mal_id) })
        }).then(res => {
            heroWatchlist.innerText = res.ok ? '✓ Added!' : 'Error';
            if (res.ok) heroWatchlist.classList.add('added');
          }).catch(() => { heroWatchlist.innerText = 'Error'; heroWatchlist.disabled = false; });
      };
    }
    if (heroDetails) {
      heroDetails.onclick = () => { if (anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`; };
    }
    heroDots.forEach((dot, i) => dot.classList.toggle("active", i === currentHeroIndex));
  }

  function goToHero(index) {
    if (!heroAnimes.length) return;
    currentHeroIndex = ((index % heroAnimes.length) + heroAnimes.length) % heroAnimes.length;
    updateHero(heroAnimes[currentHeroIndex]);
    startHeroAutoplay();
  }
  function nextHero() { goToHero(currentHeroIndex + 1); }
  function prevHero() { goToHero(currentHeroIndex - 1); }
  function startHeroAutoplay() { clearInterval(appState.intervals.hero); appState.intervals.hero = setInterval(nextHero, 8000); }
  function stopHeroAutoplay() { clearInterval(appState.intervals.hero); }

  heroDots.forEach((dot, i) => {
    dot.onclick = () => goToHero(i);
    dot.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToHero(i); } };
  });
  if (heroArrowLeft) heroArrowLeft.onclick = prevHero;
  if (heroArrowRight) heroArrowRight.onclick = nextHero;
  if (hero) { hero.onmouseenter = stopHeroAutoplay; hero.onmouseleave = startHeroAutoplay; }

  // Genres
  const genres = [
    { id: 1, name: 'Action', icon: '⚔️' }, { id: 2, name: 'Adventure', icon: '🗺️' },
    { id: 4, name: 'Comedy', icon: '😂' }, { id: 8, name: 'Drama', icon: '🎭' },
    { id: 10, name: 'Fantasy', icon: '🧙' }, { id: 14, name: 'Horror', icon: '👻' },
    { id: 22, name: 'Romance', icon: '💕' }, { id: 24, name: 'Sci-Fi', icon: '🚀' },
    { id: 30, name: 'Sports', icon: '⚽' }, { id: 36, name: 'Slice of Life', icon: '🌸' }
  ];

  if (genreChips) {
    const allChip = document.createElement('button');
    allChip.className = 'genre-chip active';
    allChip.innerHTML = '✨ All';
    allChip.onclick = () => resetToHome();
    genreChips.appendChild(allChip);
    genres.forEach(g => {
      const chip = document.createElement('button');
      chip.className = 'genre-chip';
      chip.innerHTML = `${g.icon} ${g.name}`;
      chip.onclick = (e) => filterByGenre(g.id, g.name, e.target);
      genreChips.appendChild(chip);
    });
  }

  async function filterByGenre(genreId, genreName, clickedChip) {
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    if (clickedChip) clickedChip.classList.add('active');
    showResults();
    appState.viewState = { mode: 'genre', currentQuery: genreId, currentPage: 1, isLoading: true, hasMore: true };
    if (resultsBox) {
      resultsBox.innerHTML = `
        <div class="filter-header" style="margin-bottom: 20px;">
          <h2 style="font-size: 1.5rem;">${clickedChip ? clickedChip.innerText : '🎭 ' + genreName} Anime</h2>
        </div>
        <div class="loading">Loading...</div>
      `;
    }
    await loadGenrePage(genreId);
  }

  async function loadGenrePage(genreId, btnElement = null) {
    if (!resultsBox) return;
    try {
      const page = appState.viewState.currentPage;
      // [FIX] Use queuedFetch
      const data = await queuedFetch(`https://api.jikan.moe/v4/anime?genres=${genreId}&order_by=popularity&sfw=true&limit=24&page=${page}`);
      
      const loader = resultsBox.querySelector('.loading');
      if (loader) loader.remove();

      if (!data.length) {
        if (page === 1) {
          resultsBox.innerHTML = '<div class="empty-state"><div class="empty-icon">🔭</div><h3>No anime found</h3></div>';
        } else if (btnElement) {
          btnElement.innerText = 'No more results'; btnElement.disabled = true;
        }
        return;
      }
      renderAnimeGrid(resultsBox, data, page > 1);
      if (data.length === 24) {
        appState.viewState.currentPage++;
        renderLoadMoreButton(resultsBox, (btn) => loadGenrePage(genreId, btn));
      } else if (btnElement) {
        const container = btnElement.closest('.load-more-container');
        if (container) container.remove();
      }
    } catch (e) { 
      console.error('Genre load error:', e);
      if (btnElement) { btnElement.disabled = false; btnElement.style.opacity = '1'; btnElement.innerText = '⚠ Error - Retry'; }
      else {
        const loader = resultsBox.querySelector('.loading'); if (loader) loader.remove();
        resultsBox.innerHTML += '<div class="error-state"><p>Failed to load anime</p><button class="retry-btn" onclick="location.reload()">Retry</button></div>';
      }
    }
  }

  // Load All Data
  async function loadAllData() {
    try {
      await loadHero(); 
      // Sequential loading handled by Queue
      loadSection("seasonal", "https://api.jikan.moe/v4/seasons/now?sfw=true&limit=25");
      loadSection("trending", "https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=25");
      loadTopAnime();
    } catch (e) { console.error('Error loading data:', e); }
  }

  // Recommends Preview
  const recommendsPreviewList = [
    { id: 9253, note: "A rare time-travel story that rewards patience and attention." },
    { id: 16498, note: "A series that redefined how dark and ambitious anime could be." },
    { id: 52991, note: "Quiet, emotional fantasy that values reflection over spectacle." },
    { id: 48849, note: "Abstract, unsettling, and deeply personal." },
    { id: 5114, note: "A complete story with strong themes and unforgettable characters." }
  ];

  if (recommendsPreview) {
    // 1. Show Skeletons
    recommendsPreview.innerHTML = "";
    recommendsPreviewList.forEach(() => recommendsPreview.appendChild(createSkeletonCard()));

    // 2. Load Real Data via Queue
    recommendsPreviewList.forEach(async item => {
      try {
        // [CRITICAL FIX] Use queuedFetch and expect unwrapped anime object
        const anime = await queuedFetch(`https://api.jikan.moe/v4/anime/${item.id}`);
        if (!anime || !anime.mal_id) return;
        
        const card = createCard(anime, { disableLazy: true });
        card.style.minWidth = "200px";

        if (item.note) {
          const note = document.createElement("p");
          note.className = "editor-note";
          note.textContent = item.note;
          const contentDiv = card.querySelector('div:last-child');
          if (contentDiv) contentDiv.appendChild(note);
        }

        const skeletons = recommendsPreview.querySelectorAll(".skeleton-card");
        if (skeletons.length) skeletons.forEach(s => s.remove());

        recommendsPreview.appendChild(card);
      } catch (e) { console.error("Failed to load recommended anime", e); }
    });
  }

  // Render Curated Lists
  function renderCuratedList(containerId, list) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.className = "responsive-grid";
    container.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px;`;

    list.forEach(async item => {
      try {
        // [FIX] Use queuedFetch
        const anime = await queuedFetch(`https://api.jikan.moe/v4/anime/${item.id}`);
        
        const card = createCard(anime);
        if (item.note) {
          const note = document.createElement("p");
          note.className = "editor-note";
          note.textContent = item.note;
          const contentDiv = card.querySelector('div:last-child');
          if (contentDiv) contentDiv.appendChild(note);
        }
        container.appendChild(card);
      } catch (e) { console.error("Failed to render curated list", e); }
    });
  }

  renderCuratedList("mustWatch", curatedLists.mustWatch);
  renderCuratedList("hiddenGems", curatedLists.hiddenGems);
  renderCuratedList("topTen", curatedLists.topTen);

  async function loadHero() {
    try {
      // [FIX] Use queuedFetch
      const data = await queuedFetch("https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=7");
      if (data && data.length) {
        heroAnimes = data;
        updateHero(data[0]);
        startHeroAutoplay();
      }
    } catch(e) { console.error('Hero load error:', e); }
  }

  async function loadSection(id, url) {
    const box = getElement(id);
    if (!box) return;
    if (!carousels[id]) carousels[id] = { currentPage: 0, totalCards: 0 };
    try {
      // [FIX] Use queuedFetch
      const data = await queuedFetch(url);
      box.innerHTML = "";
      carousels[id].totalCards = data.length;
      data.forEach(a => {
        const div = createCard(a);
        div.style.width = '100%'; div.style.height = '100%';
        box.appendChild(div);
      });
      updateCarousel(id);
    } catch(e) { 
      console.error(`Section ${id} load error:`, e);
      box.innerHTML = '<div class="error-state">Failed to load</div>';
    }
  }

  function updateCarousel(id) {
    const container = getElement(id);
    const state = carousels[id];
    if (!container || !state) return;
    const cards = container.querySelectorAll(".anime-card");
    cards.forEach((card, index) => {
      const start = state.currentPage * CARDS_PER_PAGE;
      const end = start + CARDS_PER_PAGE;
      card.style.display = (index >= start && index < end) ? "flex" : "none";
    });
    const wrapper = container.closest(".row-wrapper");
    if (wrapper) {
      const leftBtn = wrapper.querySelector(".nav-btn.left");
      const rightBtn = wrapper.querySelector(".nav-btn.right");
      if (leftBtn) { leftBtn.disabled = state.currentPage <= 0; leftBtn.style.opacity = leftBtn.disabled ? '0.3' : '1'; }
      if (rightBtn) { 
        const totalPages = Math.ceil(state.totalCards / CARDS_PER_PAGE);
        rightBtn.disabled = state.currentPage >= totalPages - 1; 
        rightBtn.style.opacity = rightBtn.disabled ? '0.3' : '1'; 
      }
    }
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.target;
      if (!id || !carousels[id]) return;
      const state = carousels[id];
      const dir = btn.classList.contains("left") ? -1 : 1;
      const totalPages = Math.ceil(state.totalCards / CARDS_PER_PAGE);
      const newPage = state.currentPage + dir;
      if (newPage < 0 || newPage >= totalPages) return;
      state.currentPage = newPage;
      updateCarousel(id);
    };
  });

  async function loadTopAnime() {
    if (!topBox) return;
    try {
      // [FIX] Use queuedFetch
      const data = await queuedFetch("https://api.jikan.moe/v4/top/anime?sfw=true&limit=10");
      topBox.innerHTML = "";
      data.forEach((a, i) => {
        const div = document.createElement("div");
        div.className = "top-item";
        div.setAttribute('tabindex', '0');
        div.setAttribute('role', 'button');
        div.onclick = () => { if (a.mal_id) location.href = `/anime.html?id=${a.mal_id}`; };
        div.innerHTML = `
          <span class="rank">#${i + 1}</span>
          <img src="${a.images?.jpg?.image_url || ''}" alt="${a.title}" style="width: 50px; height: 70px; object-fit: cover; border-radius: 4px;">
          <div class="top-item-info" style="margin-left: 10px;">
            <span class="top-title" style="display: block; font-weight: bold;">${a.title || 'Unknown'}</span>
            <span class="top-score">⭐ ${a.score || "N/A"}</span>
          </div>
        `;
        topBox.appendChild(div);
      });
    } catch(e) { console.error('Top anime load error:', e); topBox.innerHTML = '<div class="error-state">Failed to load</div>'; }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('search');
  if (searchParam && searchInput && resultsBox) {
    searchInput.value = searchParam;
    handleSearch(searchParam);
  } else {
    // [FIX] Avoid Double Load for Hero
    if (seasonalBox) {
        loadAllData(); // Loads Hero internally
    } else if (typeof loadHero === "function") {
        loadHero();
    }
  }

  window.addEventListener('beforeunload', () => { stopHeroAutoplay(); cleanupObserver(); });
});

// =====================
// GLOBAL FUNCTIONS (Schedule & Random)
// =====================
async function loadSchedule(day) {
  const grid = getElement('scheduleGrid');
  const buttons = document.querySelectorAll('.day-btn');
  if (!grid) return;
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const normalizedDay = (day || '').toLowerCase().trim();
  if (!validDays.includes(normalizedDay)) { grid.innerHTML = '<div class="error-state">Invalid day</div>'; return; }

  buttons.forEach(b => {
    const btnDay = b.innerText.toLowerCase().trim();
    b.classList.toggle('active', btnDay.includes(normalizedDay.substring(0, 3)));
  });
  grid.innerHTML = `<div class="loading">Fetching ${normalizedDay}'s anime...</div>`;

  try {
    // [FIX] Use queuedFetch
    const data = await queuedFetch(`https://api.jikan.moe/v4/schedules?filter=${normalizedDay}&sfw=true`);
    grid.innerHTML = '';
    if (!data.length) { grid.innerHTML = '<div class="empty-state"><h3>No anime airing this day</h3></div>'; return; }
    data.forEach(anime => {
      const div = document.createElement('div');
      div.className = 'schedule-card';
      div.onclick = () => { if (anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`; };
      div.innerHTML = `
        <img src="${anime.images?.jpg?.image_url || ''}" class="schedule-img" alt="${anime.title}" loading="lazy">
        <div class="schedule-info">
          <div class="time-badge">⏰ ${anime.broadcast?.time || 'TBA'} JST</div>
          <div class="schedule-title">${anime.title || 'Unknown'}</div>
          <div class="schedule-meta">${(anime.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A'}</div>
        </div>
      `;
      grid.appendChild(div);
    });
  } catch (e) { console.error('Schedule error:', e); grid.innerHTML = '<div class="error-state">Failed to load schedule</div>'; }
}
window.loadSchedule = loadSchedule; 

async function spinWheel() {
  let overlay = getElement('spinOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'spinOverlay';
    overlay.className = 'spin-overlay';
    overlay.innerHTML = `<div class="spinner-content"><div class="big-spinner">🎲</div><h3 style="color:white; margin:0">Finding your next obsession...</h3></div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('active');
  try {
    await new Promise(r => setTimeout(r, 1500));
    // [FIX] Use queuedFetch and use unwrapped anime object
    const anime = await queuedFetch('https://api.jikan.moe/v4/random/anime?sfw=true');
    if (anime && anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`;
    else throw new Error("No data");
  } catch (e) {
    console.error('Spin error:', e);
    showToast('Spin failed! Please try again.', 'error');
    overlay.classList.remove('active');
  }
}
window.spinWheel = spinWheel; 

function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-message">${message}</span>`;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 4000);
}

// =====================
// API CONFIGURATION
// =====================
const API_BASE = location.hostname === "localhost" ? "" : "https://anicrunch-backend.onrender.com";

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
  },
  hero: {
    currentIndex: 0,
    slides: [],
    isLoaded: false,
    autoPlayDelay: 8000
  }
};

const CARDS_PER_PAGE = 6;

// =====================
// CURATED LISTS DATA
// =====================
const curatedLists = {
  mustWatch: [
    { id: 9253, note: "Smart, emotional sci-fi that respects the viewer." },
    { id: 16498, note: "A landmark series that changed modern anime." },
    { id: 5114, note: "A complete story with strong themes and payoff." },
    { id: 1535, note: "Stylish, timeless, and deeply influential." },
    { id: 52991, note: "Quiet fantasy with emotional depth." }
  ],

  hiddenGems: [
    { id: 48849, note: "Abstract storytelling that demands attention." },
    { id: 6211, note: "Character-driven sports anime with unique art." },
    { id: 387, note: "Atmospheric and philosophical sci-fi." },
    { id: 457, note: "Slow, reflective, and deeply calming." }
  ],

  topTen: [
    { id: 9253 },
    { id: 16498 },
    { id: 48849 },
    { id: 44511 },
    { id: 14813 },
    { id: 10087 },
    { id: 52991 },
    { id: 20 },
    { id: 21 },
    { id: 16067 }
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
  if (appState.cache.size > 100) {
    appState.cache.clear();
  }
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Global Rate Limiter for Jikan API
let criticalQueue = Promise.resolve();
let backgroundQueue = Promise.resolve();

function queuedFetch(url, priority = 'background') {
  const queue = priority === 'critical' ? criticalQueue : backgroundQueue;
  const delayTime = priority === 'critical' ? 200 : 800;

  const next = queue.then(async () => {
    await delay(delayTime);
    return fetchWithRetry(url);
  });

  if (priority === 'critical') criticalQueue = next;
  else backgroundQueue = next;

  return next;
}

// Skeleton Generator
function createSkeletonCard() {
  const div = document.createElement("div");
  div.className = "anime-card skeleton-card";
  div.innerHTML = `
    <div style="position: relative; width: 100%; padding-top: 145%; background: #1f1f1f;"></div>
    <div style="padding: 10px;">
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
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

  const fragment = document.createDocumentFragment();
  animeList.forEach(anime => {
    const card = createCard(anime);
    card.style.width = '100%';
    card.style.height = '100%'; 
    fragment.appendChild(card);
  });
  
  if (!append) {
    grid.replaceChildren(fragment);
  } else {
    grid.appendChild(fragment);
  }
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
// FETCH (Smart Retry)
// =====================
async function fetchWithRetry(url, retries = 3, backoff = 1000) {
  const cached = getCached(url);
  if (cached) return cached;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
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
      
      if (Array.isArray(json.data)) {
        const data = json.data;
        if (data.length > 0) cacheResponse(url, data);
        return data;
      } else if (json.data) {
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
// LAZY LOADING
// =====================
const imageObserver = "IntersectionObserver" in window 
  ? new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            if (img.dataset.srcset) img.srcset = img.dataset.srcset;
            img.removeAttribute('data-src');
            img.removeAttribute('data-srcset');
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
// TITLE HELPER — prefer English title
// =====================
function getTitle(anime) {
  return anime.title_english || anime.title || 'Untitled';
}

// =====================
// CARD CREATOR (Enhanced)
// =====================
function createCard(anime, options = {}) { 
  const div = document.createElement("div");
  div.className = "anime-card";
  div.setAttribute('tabindex', '0');
  div.setAttribute('role', 'button');
  div.setAttribute('aria-label', `View details for ${getTitle(anime)}`);
  
  const img = anime.images?.jpg || {};
  const defaultUrl = img.large_image_url || img.image_url || "https://via.placeholder.com/300x420?text=No+Image";
  
  let srcset = "";
  if (img.small_image_url) srcset += `${img.small_image_url} 300w, `;
  if (img.image_url) srcset += `${img.image_url} 600w, `;
  if (img.large_image_url) srcset += `${img.large_image_url} 900w`;
  srcset = srcset.replace(/,\s*$/, ""); 

  const title = getTitle(anime);
  const score = anime.score || 'N/A';
  const year = anime.year || 'Unknown';
  const type = anime.type || 'TV';
  
  div.innerHTML = `
    <div class="anime-card-poster">
      <img data-src="${defaultUrl}" 
           ${srcset ? `data-srcset="${srcset}"` : ''}
           sizes="(max-width: 768px) 45vw, (max-width: 1200px) 220px, 280px"
           width="300" height="420"
           loading="lazy"
           src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 4'%3E%3C/svg%3E" 
           alt="${title}" 
           class="lazy-img">
      <div class="anime-card-overlay">
        <button class="anime-card-play-btn" aria-label="Play"></button>
      </div>
      <div class="anime-card-rating">
        ⭐ ${score}
      </div>
    </div>
    <div class="anime-card-content">
      <h3>${title}</h3>
      <div class="anime-card-meta">
        <span>${year}</span>
        <span>•</span>
        <span>${type}</span>
      </div>
      ${anime.genres && anime.genres.length > 0 ? `
        <div class="anime-card-genres">
          ${anime.genres.slice(0, 2).map(g => `
            <span class="anime-card-genre-tag">${g.name}</span>
          `).join('')}
        </div>
      ` : ''}
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
  
  const imageEl = div.querySelector('img');
  if (imageEl) {
    if (imageObserver && !options.disableLazy) {
      imageObserver.observe(imageEl);
    } else {
      imageEl.src = imageEl.dataset.src;
      if (imageEl.dataset.srcset) imageEl.srcset = imageEl.dataset.srcset;
      imageEl.removeAttribute('data-src');
      imageEl.removeAttribute('data-srcset');
      imageEl.classList.add('loaded');
    }
  }
  
  return div;
}
// =====================
// EPISODE CARD CREATOR
// =====================
function createEpisodeCard(entry, episode) {
  const div = document.createElement('div');
  div.className = 'episode-card';
  div.setAttribute('tabindex', '0');
  div.setAttribute('role', 'button');
  const displayTitle = entry.title_english || entry.title || 'Unknown';
  div.setAttribute('aria-label', `View ${displayTitle} - ${episode.title}`);

  const img = entry.images?.jpg || {};
  const imgUrl = img.large_image_url || img.image_url || 'https://via.placeholder.com/300x420?text=No+Image';
  const isEp1 = episode.mal_id === 1;

  div.innerHTML = `
    <div class="episode-card-poster">
      <img src="${imgUrl}" alt="${displayTitle}" loading="lazy" width="300" height="420">
      <span class="episode-badge ${isEp1 ? 'new' : ''}">EP ${episode.mal_id}</span>
    </div>
    <div class="episode-card-content">
      <h3>${displayTitle}</h3>
      <span class="episode-title">${episode.title || 'Episode ' + episode.mal_id}</span>
    </div>
  `;

  const navigate = () => {
    if (entry.mal_id) location.href = `/anime.html?id=${entry.mal_id}`;
  };
  div.onclick = navigate;
  div.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(); }
  };

  return div;
}

// =====================
// HERO CAROUSEL SYSTEM
// =====================
const HeroCarousel = {
  container: null,
  slides: [],
  dots: [],
  animeData: [],
  currentIndex: 0,
  autoPlayInterval: null,
  autoPlayDelay: 8000,
  isInitialized: false,

  init() {
    this.container = getElement('heroSlidesContainer');
    this.slides = document.querySelectorAll('.hero-slide');
    this.dots = document.querySelectorAll('.hero-dot');
    
    if (!this.container || !this.slides.length) {
      console.warn('Hero carousel elements not found');
      return;
    }

    this.setupNavigation();
    this.isInitialized = true;
  },

  setupNavigation() {
    // Arrow buttons
    const prevBtn = getElement('heroPrev');
    const nextBtn = getElement('heroNext');
    
    if (prevBtn) {
      prevBtn.onclick = () => {
        this.prev();
        this.resetAutoPlay();
      };
    }
    
    if (nextBtn) {
      nextBtn.onclick = () => {
        this.next();
        this.resetAutoPlay();
      };
    }

    // Dot navigation
    this.dots.forEach((dot, index) => {
      dot.onclick = () => {
        this.goTo(index);
        this.resetAutoPlay();
      };
      dot.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.goTo(index);
          this.resetAutoPlay();
        }
      };
    });

    // Pause on hover
    const heroSection = getElement('hero');
    if (heroSection) {
      heroSection.onmouseenter = () => this.stopAutoPlay();
      heroSection.onmouseleave = () => this.startAutoPlay();
      
      // Keyboard navigation
      heroSection.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
          this.prev();
          this.resetAutoPlay();
        } else if (e.key === 'ArrowRight') {
          this.next();
          this.resetAutoPlay();
        }
      });
    }
  },

  populateSlides(animeList) {
    if (!animeList || !animeList.length) return;
    
    this.animeData = animeList.slice(0, 5);
    
    this.animeData.forEach((anime, index) => {
      const slide = this.slides[index];
      if (!slide || !anime) return;

      // Set data attribute for ID
      slide.dataset.malId = anime.mal_id;

      // Image - Clear and sharp, no blur
      const img = slide.querySelector('.hero-bg');
      if (img) {
        const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
        
        // Clear any hardcoded srcset/sizes to prevent stale images
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        
        // For first slide, load immediately (LCP optimization)
        if (index === 0) {
          img.src = imageUrl;
          img.fetchPriority = 'high';
          img.loading = 'eager';
        } else {
          // Preload other images in background
          img.loading = 'lazy';
          img.src = imageUrl;
        }
        
        img.alt = getTitle(anime);
        img.style.filter = 'none'; // Ensure no blur
      }

      // Title
      const title = slide.querySelector('.hero-title');
      if (title) {
        title.textContent = getTitle(anime);
      }

      // Meta info
      const meta = slide.querySelector('.hero-meta');
      if (meta) {
        const score = anime.score ? `⭐ ${anime.score}` : '';
        const episodes = anime.episodes ? `${anime.episodes} eps` : 'Ongoing';
        meta.textContent = [score, episodes].filter(Boolean).join(' • ');
      }

      // Synopsis
      const synopsis = slide.querySelector('.hero-synopsis');
      if (synopsis) {
        const synopsisText = anime.synopsis || 'No synopsis available.';
        synopsis.textContent = synopsisText.length > 200 
          ? synopsisText.substring(0, 200) + '...' 
          : synopsisText;
      }

      // Badge
      const badge = slide.querySelector('.hero-badge');
      if (badge) {
        if (anime.airing) {
          badge.textContent = '📺 Currently Airing';
          badge.className = 'hero-badge airing';
        } else if (anime.score >= 8.5) {
          badge.textContent = '⭐ Top Rated';
          badge.className = 'hero-badge top-rated';
        } else {
          badge.textContent = '🔥 Featured';
          badge.className = 'hero-badge';
        }
      }

      // Genres
      const genresContainer = slide.querySelector('.hero-genres');
      if (genresContainer) {
        genresContainer.innerHTML = '';
        if (anime.genres && anime.genres.length > 0) {
          anime.genres.slice(0, 4).forEach(genre => {
            const span = document.createElement('span');
            span.textContent = genre.name;
            genresContainer.appendChild(span);
          });
        }
      }

      // Action buttons
      this.setupSlideButtons(slide, anime);
    });

    // Ensure first slide is active
    this.goTo(0, false);
    this.startAutoPlay();
  },

  setupSlideButtons(slide, anime) {
    // View Details button
    const detailsBtn = slide.querySelector('.hero-btn.primary');
    if (detailsBtn) {
      detailsBtn.onclick = (e) => {
        e.stopPropagation();
        if (anime.mal_id) {
          location.href = `/anime.html?id=${anime.mal_id}`;
        }
      };
    }

    // Add to Watchlist button
    const watchlistBtn = slide.querySelector('.hero-btn.secondary');
    if (watchlistBtn) {
      // Reset button state
      watchlistBtn.innerHTML = '<span class="btn-icon">+</span> Add to Watchlist';
      watchlistBtn.disabled = false;
      watchlistBtn.classList.remove('added');

      watchlistBtn.onclick = (e) => {
        e.stopPropagation();
        this.addToWatchlist(anime, watchlistBtn);
      };
    }
  },

  addToWatchlist(anime, btn) {
    btn.innerHTML = '<span class="btn-icon">⏳</span> Adding...';
    btn.disabled = true;

    fetch(`${API_BASE}/api/watchlist/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ animeId: Number(anime.mal_id) })
    })
    .then(res => {
      if (res.ok) {
        btn.innerHTML = '<span class="btn-icon">✓</span> Added!';
        btn.classList.add('added');
        showToast(`${getTitle(anime)} added to watchlist!`, 'success');
      } else if (res.status === 401) {
        btn.innerHTML = '<span class="btn-icon">+</span> Add to Watchlist';
        btn.disabled = false;
        showToast('Please login to add to watchlist', 'warning');
      } else {
        throw new Error('Failed to add');
      }
    })
    .catch(() => {
      btn.innerHTML = '<span class="btn-icon">!</span> Error';
      btn.disabled = false;
      showToast('Failed to add to watchlist', 'error');
      setTimeout(() => {
        btn.innerHTML = '<span class="btn-icon">+</span> Add to Watchlist';
      }, 2000);
    });
  },

  goTo(index, animate = true) {
    if (!this.slides.length) return;
    
    // Normalize index
    const totalSlides = Math.min(this.animeData.length, this.slides.length);
    this.currentIndex = ((index % totalSlides) + totalSlides) % totalSlides;

    // Update slides
    this.slides.forEach((slide, i) => {
      if (i < totalSlides) {
        if (i === this.currentIndex) {
          slide.classList.remove('exiting');
          slide.classList.add('active');
        } else {
          if (animate && slide.classList.contains('active')) {
            slide.classList.add('exiting');
          }
          slide.classList.remove('active');
        }
      } else {
        slide.classList.remove('active', 'exiting');
      }
    });

    // Update dots
    this.dots.forEach((dot, i) => {
      if (i === this.currentIndex) {
        dot.classList.add('active');
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.classList.remove('active');
        dot.removeAttribute('aria-current');
      }
    });
  },

  next() {
    this.goTo(this.currentIndex + 1);
  },

  prev() {
    this.goTo(this.currentIndex - 1);
  },

  startAutoPlay() {
    if (this.autoPlayInterval) return;
    this.autoPlayInterval = setInterval(() => this.next(), this.autoPlayDelay);
  },

  stopAutoPlay() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
      this.autoPlayInterval = null;
    }
  },

  resetAutoPlay() {
    this.stopAutoPlay();
    this.startAutoPlay();
  },

  destroy() {
    this.stopAutoPlay();
    this.isInitialized = false;
  }
};

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

  let currentSearchAbortController = null;
  
  const carousels = {
    seasonal: { currentPage: 0, totalCards: 0 },
    trending: { currentPage: 0, totalCards: 0 },
    recentEpisodes: { currentPage: 0, totalCards: 0 }
  };

  // Initialize Hero Carousel
  HeroCarousel.init();

  function showHome() {
    appState.viewState.mode = 'home';
    if (homeSections) {
      homeSections.classList.remove('hidden');
    }
    if (hero) hero.classList.remove('hidden');
    if (searchBlock) searchBlock.style.display = "none";
    if (resultsBox) resultsBox.replaceChildren(); 
    if (searchClear) searchClear.style.display = "none";
  }

  function showResults() {
    if (homeSections) {
      homeSections.classList.add('hidden');
    }
    if (hero) hero.classList.add('hidden');
    if (searchBlock) searchBlock.style.display = "block";
  }

  // Defer non-critical setup tasks
  const idleCallback = window.requestIdleCallback || (cb => setTimeout(cb, 1));
  
  idleCallback(() => {
    // Auth Setup
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject('Not authenticated'))
      .then(d => {
        if (d.user && authArea) {
          authArea.innerHTML = `
            <a href="/profile.html" class="auth-link" style="color: var(--accent); font-weight: bold;">👤 My Profile</a>
            <a href="/watchlist.html" class="auth-link">📚 Watchlist</a>
            <button class="auth-link" onclick="logout()">Logout</button>
          `;
        }
      }).catch(() => {});

    // Search Listeners
    if (searchInput) {
      searchInput.oninput = (e) => {
        resetVibeSliders();
        handleSearch(e.target.value.trim());
      };
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

    // Genre Chips Setup
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

    // Note: Vibe Mixer has been fully moved to its own page vibe-mixer.html to prevent DOM/API clashes


    // Initialize Cozy Mode globally on all browsing pages
    if (typeof CozyMode !== 'undefined') {
      CozyMode.init();
    }

    // Initialize Character Battle Arena sidebar carousel on the homepage
    if (typeof CharacterBattleArena !== 'undefined') {
      CharacterBattleArena.init();
    }
  });

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

    let searchHeader = document.getElementById("searchHeader");
    if (!searchHeader) {
      searchHeader = document.createElement("div");
      searchHeader.id = "searchHeader";
      searchHeader.className = "filter-header";
      resultsBox.parentElement.insertBefore(searchHeader, resultsBox);
    }
    searchHeader.innerHTML = `<h2>🔍 Results for "${escapeHtml(query)}"</h2>`;
    searchHeader.style.display = "block";

    resultsBox.replaceChildren();
    
    const loader = document.createElement("div");
    loader.className = "loading active";
    loader.textContent = "Loading...";
    resultsBox.appendChild(loader);

    await loadSearchPage(query);
  }, 300);

  async function loadSearchPage(query, btnElement = null) {
    if (!resultsBox) return;
    try {
      let data = [];
      try {
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
        const jikanData = await queuedFetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=24`, 'critical');
        data = Array.isArray(jikanData) ? jikanData : [];
      }

      if (!data.length) {
        resultsBox.innerHTML = `<div class="empty-state"><p>No results found.</p></div>`;
        return;
      }
      renderAnimeGrid(resultsBox, data);
    } catch (err) {
      if (err.name === "AbortError") return;
      resultsBox.innerHTML = `<div class="empty-state"><p>⚠️ Failed to load search results</p></div>`;
      console.error(err);
    }
  }

  function resetVibeSliders() {
    // Safe no-op on pages loaded via script.js since vibe mixing now lives completely inside vibe-mixer.html
  }


  function resetToHome() {
    resetVibeSliders();
    appState.viewState = { mode: 'home', currentQuery: '', currentPage: 1, isLoading: false, hasMore: true };
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    const allChip = document.querySelector('.genre-chip');
    if (allChip) allChip.classList.add('active'); 
    if (searchInput) searchInput.value = '';
    
    const searchHeader = document.getElementById("searchHeader");
    if (searchHeader) searchHeader.style.display = "none";
    
    showHome();
    if (window.history.replaceState) window.history.replaceState({}, document.title, window.location.pathname);
  }

  async function filterByGenre(genreId, genreName, clickedChip) {
    resetVibeSliders();
    document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
    if (clickedChip) clickedChip.classList.add('active');
    showResults();
    appState.viewState = { mode: 'genre', currentQuery: genreId, currentPage: 1, isLoading: true, hasMore: true };
    
    let searchHeader = document.getElementById("searchHeader");
    if (!searchHeader) {
      searchHeader = document.createElement("div");
      searchHeader.id = "searchHeader";
      searchHeader.className = "filter-header";
      resultsBox.parentElement.insertBefore(searchHeader, resultsBox);
    }
    searchHeader.innerHTML = `<h2 style="font-size: 1.5rem;">${clickedChip ? clickedChip.innerText : '🎭 ' + genreName} Anime</h2>`;
    searchHeader.style.display = "block";

    resultsBox.replaceChildren();
    const loader = document.createElement("div");
    loader.className = "loading active";
    loader.textContent = "Loading...";
    resultsBox.appendChild(loader);

    await loadGenrePage(genreId);
  }

  async function loadGenrePage(genreId, btnElement = null) {
    if (!resultsBox) return;
    try {
      const page = appState.viewState.currentPage;
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
      // Critical: Load Hero immediately
      queuedFetch("https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=5", 'critical')
        .then(data => {
          if (data && data.length) {
            HeroCarousel.populateSlides(data);
          }
        });

      idleCallback(() => loadSection("seasonal", "https://api.jikan.moe/v4/seasons/now?sfw=true&limit=25"));
      idleCallback(() => loadSection("trending", "https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=25"));
      idleCallback(() => loadTopAnime());
      idleCallback(() => loadRecentEpisodesPreview());

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
    recommendsPreview.innerHTML = "";
    const fragment = document.createDocumentFragment();
    recommendsPreviewList.forEach(() => fragment.appendChild(createSkeletonCard()));
    recommendsPreview.appendChild(fragment);

    // Bind scroll boundary check
    recommendsPreview.addEventListener("scroll", () => updateScrollButtons(recommendsPreview));

    let itemsLoaded = 0;
    recommendsPreviewList.forEach(async item => {
      try {
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

        const skeleton = recommendsPreview.querySelector(".skeleton-card");
        if (skeleton) {
          skeleton.replaceWith(card);
        } else {
          recommendsPreview.appendChild(card);
        }
        
        itemsLoaded++;
        if (itemsLoaded === recommendsPreviewList.length) {
          setTimeout(() => updateScrollButtons(recommendsPreview), 200);
        }
      } catch (e) { console.error("Failed to load recommended anime", e); }
    });
  }

  function renderCuratedList(containerId, list) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.className = "responsive-grid";
    container.style.cssText = `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px;`;

    list.forEach(async item => {
      try {
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

  // Defer non-critical curated lists
  idleCallback(() => {
    renderCuratedList("mustWatch", curatedLists.mustWatch);
    renderCuratedList("hiddenGems", curatedLists.hiddenGems);
    renderCuratedList("topTen", curatedLists.topTen);
  });

  function updateScrollButtons(container) {
    if (!container || window.innerWidth <= 768) return;
    const wrapper = container.closest(".row-wrapper");
    if (!wrapper) return;
    const leftBtn = wrapper.querySelector(".nav-btn.left");
    const rightBtn = wrapper.querySelector(".nav-btn.right");
    
    const scrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - container.clientWidth;
    
    if (leftBtn) {
      const showLeft = scrollLeft > 10;
      leftBtn.disabled = !showLeft;
      leftBtn.style.opacity = showLeft ? "1" : "0";
      leftBtn.style.visibility = showLeft ? "visible" : "hidden";
    }
    
    if (rightBtn) {
      const showRight = scrollLeft < maxScroll - 10;
      rightBtn.disabled = !showRight;
      rightBtn.style.opacity = showRight ? "1" : "0";
      rightBtn.style.visibility = showRight ? "visible" : "hidden";
    }
  }

  function updateCarousel(id) {
    const container = getElement(id);
    if (!container) return;
    
    if (window.innerWidth > 768) {
      updateScrollButtons(container);
      return;
    }

    const state = carousels[id];
    if (!state) return;
    
    const cards = container.querySelectorAll(".anime-card, .episode-card");
    const totalCards = state.totalCards;
    const cardsPerPage = 6;
    const totalPages = Math.ceil(totalCards / cardsPerPage);
    
    cards.forEach((card, index) => {
      const start = state.currentPage * cardsPerPage;
      const end = start + cardsPerPage;
      
      if (index >= start && index < end) {
        card.classList.remove("hidden");
      } else {
        card.classList.add("hidden");
      }
    });
    
    const wrapper = container.closest(".row-wrapper");
    if (wrapper) {
      const leftBtn = wrapper.querySelector(".nav-btn.left");
      const rightBtn = wrapper.querySelector(".nav-btn.right");
      
      if (leftBtn) { 
        leftBtn.disabled = state.currentPage <= 0; 
        leftBtn.style.opacity = leftBtn.disabled ? '0.25' : '1'; 
      }
      if (rightBtn) { 
        rightBtn.disabled = state.currentPage >= totalPages - 1; 
        rightBtn.style.opacity = rightBtn.disabled ? '0.25' : '1'; 
      }
      
      let indicator = wrapper.querySelector('.page-indicator');
      if (!indicator) {
        indicator = document.createElement('span');
        indicator.className = 'page-indicator';
        if (leftBtn && rightBtn) {
          leftBtn.after(indicator);
        }
      }
      indicator.textContent = `${state.currentPage + 1} / ${totalPages}`;
    }
  }

  async function loadSection(id, url) {
    const box = getElement(id);
    if (!box) return;
    if (!carousels[id]) carousels[id] = { currentPage: 0, totalCards: 0 };
    
    try {
      const data = await queuedFetch(url);
      carousels[id].totalCards = data.length;
      const fragment = document.createDocumentFragment();
      data.forEach(a => {
        const card = createCard(a);
        card.style.width = '100%';
        card.style.height = '100%';
        fragment.appendChild(card);
      });
      box.replaceChildren(fragment);
      
      // Bind scroll boundary check
      box.addEventListener("scroll", () => updateScrollButtons(box));
      
      updateCarousel(id);
      setTimeout(() => updateScrollButtons(box), 150);
    } catch(e) { 
      console.error(`Section ${id} load error:`, e);
      box.innerHTML = '<div class="error-state">Failed to load</div>';
    }
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.target;
      if (!id) return;
      const container = getElement(id);
      if (!container) return;
      
      const dir = btn.classList.contains("left") ? -1 : 1;
      
      if (window.innerWidth > 768) {
        const scrollAmount = container.clientWidth * 0.85;
        container.scrollBy({ left: dir * scrollAmount, behavior: 'smooth' });
      } else {
        if (!carousels[id]) return;
        const state = carousels[id];
        const cardsPerPage = 6;
        const totalPages = Math.ceil(state.totalCards / cardsPerPage);
        const newPage = state.currentPage + dir;
        if (newPage < 0 || newPage >= totalPages) return;
        state.currentPage = newPage;
        updateCarousel(id);
        const block = container.closest('.block');
        if (block) {
          block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };
  });

  window.addEventListener('resize', debounce(() => {
    Object.keys(carousels).forEach(id => {
      updateCarousel(id);
    });
    const recs = getElement('recommendsPreview');
    if (recs) updateScrollButtons(recs);
  }, 250));

  async function loadTopAnime() {
    if (!topBox) return;
    try {
      const data = await queuedFetch("https://api.jikan.moe/v4/top/anime?sfw=true&limit=10");
      topBox.innerHTML = "";
      const fragment = document.createDocumentFragment();
      data.forEach((a, i) => {
        const div = document.createElement("div");
        div.className = "top-item";
        div.setAttribute('tabindex', '0');
        div.setAttribute('role', 'button');
        div.onclick = () => { if (a.mal_id) location.href = `/anime.html?id=${a.mal_id}`; };
        div.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (a.mal_id) location.href = `/anime.html?id=${a.mal_id}`;
          }
        };
        const imgUrl = a.images?.jpg?.image_url || a.images?.jpg?.large_image_url || '';
        div.innerHTML = `
          <span class="rank">#${i + 1}</span>
          <img src="${imgUrl}" alt="${getTitle(a)}" loading="lazy">
          <div class="top-item-info">
            <span class="top-title">${getTitle(a)}</span>
            <span class="top-score">⭐ ${a.score || "N/A"}</span>
          </div>
        `;
        fragment.appendChild(div);
      });
      topBox.replaceChildren(fragment);
    } catch(e) { 
      console.error('Top anime load error:', e); 
      topBox.innerHTML = '<div class="error-state">Failed to load</div>'; 
    }
  }

  // Check URL params and initialize
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('search');
  if (searchParam && searchInput && resultsBox) {
    searchInput.value = searchParam;
    handleSearch(searchParam);
  } else {
    if (seasonalBox) {
      loadAllData();
    } else {
      // For pages without seasonal box, just load hero
      queuedFetch("https://api.jikan.moe/v4/top/anime?filter=airing&sfw=true&limit=5", 'critical')
        .then(data => {
          if (data && data.length) {
            HeroCarousel.populateSlides(data);
          }
        });
    }
  }

  // =====================
  // RECENT EPISODES (Homepage Preview)
  // =====================
  async function loadRecentEpisodesPreview() {
    const box = getElement('recentEpisodes');
    if (!box) return;

    try {
      // Get today's day name for accurate schedule
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = days[new Date().getDay()];

      const res = await fetch(`https://api.jikan.moe/v4/schedules?filter=${today}&sfw=true&limit=25`);
      const json = await res.json();
      let items = json.data || [];

      // Filter: only show anime with a score or decent popularity (skip obscure kids shows)
      items = items.filter(a => (a.score && a.score > 0) || a.members > 5000);

      // Sort by score descending, then popularity
      items.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.popularity || 99999) - (b.popularity || 99999));

      // Show up to 18 cards (3 pages of 6)
      const limited = items.slice(0, 18);

      if (!limited.length) {
        box.innerHTML = '<div class="empty-state"><p>No popular anime airing today</p></div>';
        return;
      }

      const fragment = document.createDocumentFragment();
      limited.forEach(anime => {
        const entry = {
          mal_id: anime.mal_id,
          title: getTitle(anime),
          images: anime.images
        };
        const episode = {
          mal_id: anime.episodes || '?',
          title: anime.broadcast?.time ? `Airs at ${anime.broadcast.time} JST` : 'Airing Today'
        };
        const card = createEpisodeCard(entry, episode);
        card.style.width = '100%';
        card.style.height = '100%';
        fragment.appendChild(card);
      });
      box.replaceChildren(fragment);

      // Bind scroll boundary check
      box.addEventListener("scroll", () => updateScrollButtons(box));

      // Update carousel state
      if (carousels.recentEpisodes) {
        carousels.recentEpisodes.totalCards = limited.length;
        updateCarousel('recentEpisodes');
      }
      setTimeout(() => updateScrollButtons(box), 150);
    } catch (e) {
      console.error('Recent episodes load error:', e);
      box.innerHTML = '<div class="error-state">Failed to load recent episodes</div>';
    }
  }
  window.loadRecentEpisodesPreview = loadRecentEpisodesPreview;

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => { 
    HeroCarousel.destroy();
    cleanupObserver(); 
  });
});

// =====================
// SCHEDULE FUNCTIONALITY
// =====================
async function loadSchedule(day) {
  const grid = getElement('scheduleGrid');
  const buttons = document.querySelectorAll('.day-btn');
  if (!grid) return;
  
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const normalizedDay = (day || '').toLowerCase().trim();
  if (!validDays.includes(normalizedDay)) { 
    grid.innerHTML = '<div class="error-state">Invalid day</div>'; 
    return; 
  }

  buttons.forEach(b => {
    const btnDay = b.innerText.toLowerCase().trim();
    b.classList.toggle('active', btnDay.includes(normalizedDay.substring(0, 3)));
  });
  
  grid.innerHTML = `<div class="loading active">Fetching ${normalizedDay}'s anime...</div>`;

  try {
    const data = await queuedFetch(`https://api.jikan.moe/v4/schedules?filter=${normalizedDay}&sfw=true`);
    grid.innerHTML = '';
    if (!data.length) { 
      grid.innerHTML = '<div class="empty-state"><h3>No anime airing this day</h3></div>'; 
      return; 
    }
    
    const fragment = document.createDocumentFragment();
    data.forEach(anime => {
      const div = document.createElement('div');
      div.className = 'schedule-card';
      div.setAttribute('tabindex', '0');
      div.setAttribute('role', 'button');
      div.onclick = () => { if (anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`; };
      div.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (anime.mal_id) location.href = `/anime.html?id=${anime.mal_id}`;
        }
      };
      const imgUrl = anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url || '';
      div.innerHTML = `
        <img src="${imgUrl}" class="schedule-img" alt="${getTitle(anime)}" loading="lazy">
        <div class="schedule-info">
          <div class="time-badge">⏰ ${anime.broadcast?.time || 'TBA'} JST</div>
          <div class="schedule-title">${getTitle(anime)}</div>
          <div class="schedule-meta">${(anime.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A'}</div>
        </div>
      `;
      fragment.appendChild(div);
    });
    grid.replaceChildren(fragment);
  } catch (e) { 
    console.error('Schedule error:', e); 
    grid.innerHTML = '<div class="error-state">Failed to load schedule</div>'; 
  }
}
window.loadSchedule = loadSchedule; 


// =====================
// RECENT EPISODES (Full Page)
// =====================
let recentEpisodesPage = 1;
let recentEpisodesLoading = false;

async function loadAllRecentEpisodes(page = 1, append = false) {
  const grid = getElement('recentEpisodesGrid');
  if (!grid) return;
  if (recentEpisodesLoading) return;
  recentEpisodesLoading = true;

  // Get today's day name
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[new Date().getDay()];

  // Update the hero subtitle with today's day
  const heroSubtitle = document.querySelector('.recent-hero p');
  if (heroSubtitle) {
    const dayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);
    heroSubtitle.textContent = `Anime episodes airing on ${dayCapitalized} – stay up to date!`;
  }

  if (!append) {
    grid.innerHTML = '<div class="loading active">Loading today\'s anime...</div>';
  }

  try {
    const res = await fetch(`https://api.jikan.moe/v4/schedules?filter=${today}&sfw=true&page=${page}&limit=25`);
    const json = await res.json();
    let items = json.data || [];
    const hasNext = json.pagination?.has_next_page || false;

    // Filter out very obscure entries
    items = items.filter(a => (a.score && a.score > 0) || a.members > 1000);

    // Sort by score descending
    items.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!append) grid.innerHTML = '';

    // Remove existing load more button
    const existingBtn = document.getElementById('loadMoreRecentBtn');
    if (existingBtn) existingBtn.remove();

    if (!items.length && !append) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📺</div><h3>No popular anime airing today</h3><p>Check back on another day!</p></div>';
      recentEpisodesLoading = false;
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(anime => {
      const entry = {
        mal_id: anime.mal_id,
        title: getTitle(anime),
        images: anime.images
      };
      const episode = {
        mal_id: anime.episodes || '?',
        title: anime.broadcast?.time ? `Airs at ${anime.broadcast.time} JST` : 'Airing Today'
      };
      const card = createEpisodeCard(entry, episode);
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);

    // Add load more button if more pages exist
    if (hasNext) {
      const btnContainer = document.createElement('div');
      btnContainer.id = 'loadMoreRecentBtn';
      btnContainer.style.cssText = 'grid-column: 1 / -1; display: flex; justify-content: center; padding: 30px 0;';
      const btn = document.createElement('button');
      btn.innerText = '⬇ Load More';
      btn.style.cssText = 'padding: 12px 30px; background: linear-gradient(135deg, #00e676, #00c853); color: #0a0a0a; border: none; border-radius: 50px; cursor: pointer; font-weight: 700; font-size: 14px; font-family: inherit; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(0, 230, 118, 0.4);';
      btn.onmouseover = () => { btn.style.transform = 'scale(1.05)'; };
      btn.onmouseout = () => { btn.style.transform = 'scale(1)'; };
      btn.onclick = () => {
        btn.innerText = '⏳ Loading...';
        btn.disabled = true;
        btn.style.opacity = '0.7';
        recentEpisodesPage++;
        loadAllRecentEpisodes(recentEpisodesPage, true);
      };
      btnContainer.appendChild(btn);
      grid.appendChild(btnContainer);
    }
  } catch (e) {
    console.error('All recent episodes load error:', e);
    if (!append) grid.innerHTML = '<div class="error-state"><p>Failed to load</p><button class="retry-btn" onclick="loadAllRecentEpisodes(1)">Retry</button></div>';
  } finally {
    recentEpisodesLoading = false;
  }
}
window.loadAllRecentEpisodes = loadAllRecentEpisodes;

// =====================
// RANDOM ANIME (SPIN WHEEL)
// =====================
async function spinWheel() {
  let overlay = getElement('spinOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'spinOverlay';
    overlay.className = 'spin-overlay';
    document.body.appendChild(overlay);
  }
  
  // Set up premium roulette wheel layout
  overlay.innerHTML = `
    <div class="roulette-container">
      <h2 class="roulette-header">🎲 Rolling for Your Next Obsession...</h2>
      <div class="roulette-viewport">
        <div class="roulette-pointer"></div>
        <div class="roulette-strip" id="rouletteStrip"></div>
      </div>
      <div class="roulette-footer">
        <span class="roulette-winner-title" id="rouletteWinnerTitle">Spinning the reels...</span>
      </div>
    </div>
  `;
  overlay.classList.add('active');
  
  try {
    // 1. Fetch winning anime from Jikan API in background
    const anime = await queuedFetch('https://api.jikan.moe/v4/random/anime?sfw=true', 'critical');
    if (!anime || !anime.mal_id) throw new Error("No random anime data found");

    // 2. Fetch popular seasonal anime to act as decoys in the strip
    let decoys = [];
    try {
      const seasonalRes = await fetch('https://api.jikan.moe/v4/seasons/now?sfw=true&limit=15');
      if (seasonalRes.ok) {
        const json = await seasonalRes.json();
        decoys = json.data || [];
      }
    } catch (_) {}

    // Fallback decoys if fetch fails
    if (decoys.length < 10) {
      decoys = [
        { title: "One Piece", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" } } },
        { title: "Naruto", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/13/17405.jpg" } } },
        { title: "Attack on Titan", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg" } } },
        { title: "Bleach", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/3/40451.jpg" } } },
        { title: "Demon Slayer", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/1908/135431.jpg" } } },
        { title: "Death Note", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/anime/9/9453.jpg" } } }
      ];
    }

    // 3. Assemble 12 total items (winner will be centered at index 9)
    const winnerTitle = anime.title_english || anime.title;
    const winnerImg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;
    
    const rouletteItems = [];
    for (let i = 0; i < 12; i++) {
      if (i === 9) {
        rouletteItems.push({
          title: winnerTitle,
          image: winnerImg,
          isWinner: true
        });
      } else {
        const decoy = decoys[i % decoys.length];
        rouletteItems.push({
          title: decoy.title_english || decoy.title,
          image: decoy.images?.jpg?.image_url || decoy.images?.jpg?.large_image_url,
          isWinner: false
        });
      }
    }

    // 4. Render cards into the strip
    const strip = document.getElementById("rouletteStrip");
    if (!strip) throw new Error("Roulette DOM nodes not found");
    
    rouletteItems.forEach(item => {
      const card = document.createElement("div");
      card.className = `roulette-card ${item.isWinner ? 'winner-card' : ''}`;
      card.innerHTML = `
        <img src="${item.image}" alt="${item.title}" loading="eager">
        <div class="roulette-card-title">${item.title}</div>
      `;
      strip.appendChild(card);
    });

    // 5. Trigger translation animation (force reflow first)
    await delay(100);
    const cardWidth = 130;
    const gap = 16;
    const itemOffset = 9 * (cardWidth + gap);
    const centerAdjustment = (strip.parentElement.offsetWidth / 2) - (cardWidth / 2);
    const finalTranslate = itemOffset - centerAdjustment;

    strip.style.transform = `translateX(-${finalTranslate}px)`;

    // 6. Reveal winning states and redirect
    await delay(3500);
    document.getElementById("rouletteWinnerTitle").innerHTML = `🎉 Winner: <strong style="color: #ff6bc5;">${winnerTitle}</strong>!`;
    const winnerCardEl = document.querySelector(".winner-card");
    if (winnerCardEl) winnerCardEl.classList.add("reveal");

    await delay(1500);
    location.href = `/anime.html?id=${anime.mal_id}`;

  } catch (e) {
    console.error('Spin error:', e);
    showToast('Spin failed! Please try again.', 'error');
    overlay.classList.remove('active');
  }
}
window.spinWheel = spinWheel; 

// =====================
// TOAST NOTIFICATIONS
// =====================
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast.show');
  if (existing) {
    existing.classList.remove('show');
  }
  
  let toast = getElement('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="toast-icon"></span>
      <span class="toast-message"></span>
      <div class="toast-progress"></div>
    `;
    document.body.appendChild(toast);
  }
  
  // Set icon based on type
  const iconEl = toast.querySelector('.toast-icon');
  const messageEl = toast.querySelector('.toast-message');
  
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };
  
  if (iconEl) iconEl.textContent = icons[type] || icons.info;
  if (messageEl) messageEl.textContent = message;
  
  toast.className = `toast toast-${type}`;
  
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  
  setTimeout(() => { 
    toast.classList.remove('show'); 
  }, 4000);
}
window.showToast = showToast;

// ==========================================
// FEATURE 4: COZY / STUDY MODE ENGINE
// ==========================================
const CozyMode = {
  active: false,
  mode: 'sakura', // sakura, snow, rain, off
  volume: 0.5,
  audio: null,
  canvas: null,
  ctx: null,
  animationFrameId: null,
  particles: [],
  maxParticles: 45,
  ripples: [],

  init() {
    // 1. Inject Canvas Backdrop
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'cozyCanvas';
    document.body.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // 2. Inject Floating Control Deck Widget
    const widget = document.createElement('div');
    widget.className = 'cozy-widget';
    widget.innerHTML = `
      <button class="cozy-toggle-btn" id="cozyToggleBtn" aria-label="Toggle Cozy Mode">
        <span>🍵</span> <span>Cozy Mode</span>
        <span class="music-indicator"></span>
      </button>
      <div class="cozy-deck-card" id="cozyDeckCard">
        <div class="cozy-deck-header">
          <h3><span>🍵</span> Cozy Ambient Deck</h3>
          <button class="cozy-close-btn" id="cozyCloseBtn" aria-label="Close panel">✕</button>
        </div>
        
        <div class="cozy-deck-section">
          <label>Lofi Study Radio</label>
          <div class="cozy-audio-controls">
            <button class="cozy-play-btn" id="cozyPlayBtn" aria-label="Play Music">▶</button>
            <div class="cozy-volume-wrapper">
              <div class="cozy-volume-row">
                <span>Volume</span>
                <span id="cozyVolumeVal">50%</span>
              </div>
              <input type="range" class="cozy-volume-slider" id="cozyVolumeSlider" min="0" max="100" value="50">
            </div>
          </div>
          <div class="cozy-visualizer-box">
            <span>Visualizer</span>
            <div class="equalizer-container" id="cozyEqualizer">
              <div class="equalizer-bar"></div>
              <div class="equalizer-bar"></div>
              <div class="equalizer-bar"></div>
              <div class="equalizer-bar"></div>
              <div class="equalizer-bar"></div>
            </div>
          </div>
        </div>

        <div class="cozy-deck-section">
          <label>Backdrop Ambient</label>
          <div class="cozy-chips-container">
            <button class="cozy-chip" data-mode="sakura">🌸 Sakura</button>
            <button class="cozy-chip" data-mode="snow">❄️ Snow</button>
            <button class="cozy-chip" data-mode="rain">🌧️ Rain</button>
            <button class="cozy-chip" data-mode="off">🚫 Off</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    // 3. Set Up Audio Object (using FreeCodeCamp stream with fallback)
    this.audio = new Audio('https://coderadio-admin.freecodecamp.org/radio/8010/radio.mp3');
    this.audio.crossOrigin = 'anonymous';

    // 4. Load Saved State from localStorage
    const saved = localStorage.getItem('anicrunch_cozy_settings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        this.active = !!settings.active;
        this.mode = settings.mode || 'sakura';
        this.volume = settings.volume !== undefined ? settings.volume : 0.5;
      } catch (e) {
        console.warn('Stale cozy settings');
      }
    }

    // 5. Apply Volume
    this.audio.volume = this.volume;
    const volSlider = document.getElementById('cozyVolumeSlider');
    const volVal = document.getElementById('cozyVolumeVal');
    if (volSlider) volSlider.value = Math.round(this.volume * 100);
    if (volVal) volVal.textContent = `${Math.round(this.volume * 100)}%`;

    // 6. Setup Canvas Dimensions & Resize Handler
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // 7. Bind Actions & Event Listeners
    this.setupListeners();

    // 8. If active, trigger environment right away (Audio remains paused until user interaction or play button tap)
    if (this.active) {
      document.body.classList.add('cozy-mode-active');
      this.updateChipState();
      this.startParticleEngine();
      
      // Attempt autoplay. If blocked by browser, it fails silently, keeping play state in "paused" visual state.
      // We show a cute little toast reminder to help them start the vibes.
      setTimeout(() => {
        if (this.active && this.audio.paused) {
          showToast('🍵 Cozy Mode Active! Tap Cozy Deck to play study lofi.', 'info');
        }
      }, 2000);
    } else {
      this.mode = 'off';
      this.updateChipState();
    }
  },

  resizeCanvas() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  },

  setupListeners() {
    const toggleBtn = document.getElementById('cozyToggleBtn');
    const closeBtn = document.getElementById('cozyCloseBtn');
    const deckCard = document.getElementById('cozyDeckCard');
    const playBtn = document.getElementById('cozyPlayBtn');
    const volSlider = document.getElementById('cozyVolumeSlider');
    const volVal = document.getElementById('cozyVolumeVal');
    
    // Toggle Deck Expanded Panel
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      deckCard.classList.toggle('expanded');
    };

    closeBtn.onclick = (e) => {
      e.stopPropagation();
      deckCard.classList.remove('expanded');
    };

    // Close deck on outside click
    document.addEventListener('click', (e) => {
      if (!deckCard.contains(e.target) && !toggleBtn.contains(e.target)) {
        deckCard.classList.remove('expanded');
      }
    });

    // Audio Play/Pause Trigger
    playBtn.onclick = () => {
      if (this.audio.paused) {
        this.playAudio();
      } else {
        this.pauseAudio();
      }
    };

    // Audio Error Handling - Failsafe backup URL just in case
    this.audio.onerror = () => {
      console.warn('Lofi radio stream interrupted, retrying or falling back');
      this.audio.src = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'; // Backup stream
      if (this.active) this.audio.play().catch(() => {});
    };

    // Volume Slider Handler
    volSlider.oninput = (e) => {
      const vol = e.target.value / 100;
      this.volume = vol;
      this.audio.volume = vol;
      volVal.textContent = `${e.target.value}%`;
      this.saveSettings();
    };

    // Ambient Selector Chips
    const chips = document.querySelectorAll('.cozy-chip');
    chips.forEach(chip => {
      chip.onclick = () => {
        const selectedMode = chip.getAttribute('data-mode');
        this.changeMode(selectedMode);
      };
    });
  },

  playAudio() {
    this.audio.play()
      .then(() => {
        const playBtn = document.getElementById('cozyPlayBtn');
        const toggleBtn = document.getElementById('cozyToggleBtn');
        const eq = document.getElementById('cozyEqualizer');
        if (playBtn) playBtn.textContent = '⏸';
        if (toggleBtn) toggleBtn.classList.add('playing');
        if (eq) eq.classList.add('playing');
        
        // Cozy Mode is active if audio plays
        this.active = true;
        document.body.classList.add('cozy-mode-active');
        
        // If backdrop was off, default to Sakura
        if (this.mode === 'off') {
          this.changeMode('sakura');
        }
        
        this.saveSettings();
      })
      .catch(err => {
        console.error('Audio play blocked:', err);
        showToast('Click play again to start lofi stream!', 'warning');
      });
  },

  pauseAudio() {
    this.audio.pause();
    const playBtn = document.getElementById('cozyPlayBtn');
    const toggleBtn = document.getElementById('cozyToggleBtn');
    const eq = document.getElementById('cozyEqualizer');
    if (playBtn) playBtn.textContent = '▶';
    if (toggleBtn) toggleBtn.classList.remove('playing');
    if (eq) eq.classList.remove('playing');
    this.saveSettings();
  },

  changeMode(selectedMode) {
    this.mode = selectedMode;
    this.updateChipState();
    this.saveSettings();

    if (selectedMode === 'off') {
      document.body.classList.remove('cozy-mode-active');
      this.stopParticleEngine();
      // Keep playing audio if active, just remove visual drift
    } else {
      this.active = true;
      document.body.classList.add('cozy-mode-active');
      this.startParticleEngine();
    }
  },

  updateChipState() {
    const chips = document.querySelectorAll('.cozy-chip');
    chips.forEach(c => {
      if (c.getAttribute('data-mode') === this.mode) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });
  },

  saveSettings() {
    localStorage.setItem('anicrunch_cozy_settings', JSON.stringify({
      active: this.active,
      mode: this.mode,
      volume: this.volume
    }));
  },

  startParticleEngine() {
    // Prevent double drawing loops
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    // Seed particles
    this.particles = [];
    this.ripples = [];
    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push(this.createParticle(true));
    }

    const draw = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      
      if (this.mode === 'sakura') {
        this.drawSakura();
      } else if (this.mode === 'snow') {
        this.drawSnow();
      } else if (this.mode === 'rain') {
        this.drawRain();
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();
  },

  stopParticleEngine() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  createParticle(randomY = false) {
    const w = this.canvas.width;
    const h = this.canvas.height;

    const y = randomY ? Math.random() * h : -20;
    const x = Math.random() * w;

    if (this.mode === 'sakura') {
      return {
        x,
        y,
        size: Math.random() * 8 + 6,
        speedY: Math.random() * 1.2 + 0.8,
        speedX: Math.random() * 0.8 - 0.4,
        oscSpeed: Math.random() * 0.02 + 0.01,
        oscRange: Math.random() * 15 + 10,
        angle: Math.random() * 360,
        spin: Math.random() * 2 - 1,
        color: `rgba(255, ${Math.floor(Math.random() * 40 + 175)}, ${Math.floor(Math.random() * 40 + 190)}, ${Math.random() * 0.4 + 0.4})`
      };
    } else if (this.mode === 'snow') {
      return {
        x,
        y,
        size: Math.random() * 3 + 1.5,
        speedY: Math.random() * 0.8 + 0.5,
        speedX: Math.random() * 0.4 - 0.2,
        oscSpeed: Math.random() * 0.01 + 0.005,
        oscRange: Math.random() * 8 + 4,
        opacity: Math.random() * 0.5 + 0.4
      };
    } else if (this.mode === 'rain') {
      return {
        x,
        y,
        len: Math.random() * 25 + 15,
        speedY: Math.random() * 12 + 10,
        speedX: -2, // Windy slant
        opacity: Math.random() * 0.15 + 0.08
      };
    }
  },

  drawSakura() {
    this.particles.forEach((p, index) => {
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.y * p.oscSpeed) * 0.5;
      p.angle += p.spin;

      // Wrap-around boundary checking
      if (p.y > this.canvas.height + 20 || p.x > this.canvas.width + 20 || p.x < -20) {
        this.particles[index] = this.createParticle(false);
        return;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.angle * Math.PI) / 180);
      this.ctx.beginPath();
      
      // Draw sakura petal outline
      this.ctx.ellipse(0, 0, p.size, p.size / 2, 0, 0, 2 * Math.PI);
      this.ctx.fillStyle = p.color;
      this.ctx.fill();
      this.ctx.restore();
    });
  },

  drawSnow() {
    this.particles.forEach((p, index) => {
      p.y += p.speedY;
      p.x += p.speedX + Math.sin(p.y * p.oscSpeed) * 0.3;

      if (p.y > this.canvas.height + 10) {
        this.particles[index] = this.createParticle(false);
        return;
      }

      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
      this.ctx.fill();
    });
  },

  drawRain() {
    // 1. Draw Rain Streaks
    this.particles.forEach((p, index) => {
      p.y += p.speedY;
      p.x += p.speedX;

      if (p.y > this.canvas.height - 10) {
        // Trigger ripple splash
        if (Math.random() < 0.4) {
          this.ripples.push({
            x: p.x,
            y: this.canvas.height - Math.random() * 15,
            radius: 1,
            maxRadius: Math.random() * 15 + 10,
            opacity: 0.6
          });
        }
        this.particles[index] = this.createParticle(false);
        return;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(p.x, p.y);
      this.ctx.lineTo(p.x + p.speedX * 0.5, p.y + p.len);
      this.ctx.strokeStyle = `rgba(165, 180, 252, ${p.opacity})`;
      this.ctx.lineWidth = 1.2;
      this.ctx.stroke();
    });

    // 2. Draw & Grow Splash Ripples
    this.ripples.forEach((r, idx) => {
      r.radius += 0.8;
      r.opacity -= 0.03;

      if (r.opacity <= 0 || r.radius >= r.maxRadius) {
        this.ripples.splice(idx, 1);
        return;
      }

      this.ctx.beginPath();
      this.ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.3, 0, 0, 2 * Math.PI);
      this.ctx.strokeStyle = `rgba(129, 140, 248, ${r.opacity})`;
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();
    });
  }
};
window.CozyMode = CozyMode;

// ==========================================
// FEATURE 5: CHARACTER BATTLE ARENA
// ==========================================
const CharacterBattleArena = {
  currentMatchIndex: 0,
  matchups: [
    {
      id: 'match1',
      title: 'The Battle of the Strongest',
      charA: { id: 124381, name: 'Satoru Gojo', anime: 'Jujutsu Kaisen', fallbackImage: 'https://cdn.myanimelist.net/images/characters/12/424342.jpg', voteSeed: 56 },
      charB: { id: 161403, name: 'Ryomen Sukuna', anime: 'Jujutsu Kaisen', fallbackImage: 'https://cdn.myanimelist.net/images/characters/3/492160.jpg', voteSeed: 44 }
    },
    {
      id: 'match2',
      title: 'Legend of the Shonen Kings',
      charA: { id: 246, name: 'Son Goku', anime: 'Dragon Ball Z', fallbackImage: 'https://cdn.myanimelist.net/images/characters/9/131317.jpg', voteSeed: 51 },
      charB: { id: 67, name: 'Monkey Luffy', anime: 'One Piece', fallbackImage: 'https://cdn.myanimelist.net/images/characters/9/310307.jpg', voteSeed: 49 }
    },
    {
      id: 'match3',
      title: 'The Eternal Rivals',
      charA: { id: 17, name: 'Naruto Uzumaki', anime: 'Naruto', fallbackImage: 'https://cdn.myanimelist.net/images/characters/9/131319.jpg', voteSeed: 53 },
      charB: { id: 13, name: 'Sasuke Uchiha', anime: 'Naruto', fallbackImage: 'https://cdn.myanimelist.net/images/characters/9/131311.jpg', voteSeed: 47 }
    }
  ],
  votes: {},

  init() {
    const container = document.getElementById('characterBattleArena');
    if (!container) return; // Sidebar Battle block is only on index.html homepage

    // Load Votes from localStorage
    const savedVotes = localStorage.getItem('anicrunch_votes');
    if (savedVotes) {
      try { this.votes = JSON.parse(savedVotes); } catch(e) {}
    }

    // Set Navigation Listeners
    const prevBtn = document.getElementById('battlePrevBtn');
    const nextBtn = document.getElementById('battleNextBtn');
    const revoteBtn = document.getElementById('battleRevoteBtn');

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentMatchIndex > 0) {
          this.currentMatchIndex--;
          this.renderCurrentMatch();
        }
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentMatchIndex < this.matchups.length - 1) {
          this.currentMatchIndex++;
          this.renderCurrentMatch();
        }
      };
    }

    if (revoteBtn) {
      revoteBtn.onclick = () => {
        this.resetVote();
      };
    }

    // Load dynamic API resources in background and render
    this.renderCurrentMatch();
    this.preloadMatchupAvatars();
  },

  async renderCurrentMatch() {
    const container = document.getElementById('characterBattleArena');
    if (!container) return;

    const matchup = this.matchups[this.currentMatchIndex];
    const userVote = this.votes[matchup.id]; // 'left' or 'right' or undefined

    // Update Footer Buttons & Nav Labels
    const prevBtn = document.getElementById('battlePrevBtn');
    const nextBtn = document.getElementById('battleNextBtn');
    const indicator = document.getElementById('battleIndicator');
    const revoteBtn = document.getElementById('battleRevoteBtn');

    if (prevBtn) prevBtn.disabled = this.currentMatchIndex === 0;
    if (nextBtn) nextBtn.disabled = this.currentMatchIndex === this.matchups.length - 1;
    if (indicator) indicator.textContent = `Match ${this.currentMatchIndex + 1} of ${this.matchups.length}`;
    if (revoteBtn) revoteBtn.style.display = userVote ? 'block' : 'none';

    // Set loading visual opacity
    container.style.opacity = '0.5';

    // Load details (from Jikan with fallback to local)
    const [charADetails, charBDetails] = await Promise.all([
      this.fetchCharacterDetails(matchup.charA),
      this.fetchCharacterDetails(matchup.charB)
    ]);

    container.style.opacity = '1';
    container.innerHTML = `
      <div class="battle-char-card vote-left ${userVote ? 'voted' : ''} ${userVote === 'left' ? 'user-choice' : ''}" id="btnVoteLeft">
        <img src="${charADetails.image}" alt="${charADetails.name}">
        <div class="battle-percentage" id="percentLeft">--%</div>
        <div class="battle-char-info">
          <p class="battle-char-name">${charADetails.name}</p>
          <p class="battle-char-anime">${charADetails.anime}</p>
        </div>
      </div>
      
      <div class="battle-vs-badge">VS</div>
      
      <div class="battle-char-card vote-right ${userVote ? 'voted' : ''} ${userVote === 'right' ? 'user-choice' : ''}" id="btnVoteRight">
        <img src="${charBDetails.image}" alt="${charBDetails.name}">
        <div class="battle-percentage" id="percentRight">--%</div>
        <div class="battle-char-info">
          <p class="battle-char-name">${charBDetails.name}</p>
          <p class="battle-char-anime">${charBDetails.anime}</p>
        </div>
      </div>
    `;

    // Bind click actions if user hasn't voted yet
    if (!userVote) {
      document.getElementById('btnVoteLeft').onclick = () => this.castVote('left');
      document.getElementById('btnVoteRight').onclick = () => this.castVote('right');
      document.getElementById('battleResultsBar').classList.remove('visible');
    } else {
      this.animateResults(userVote);
    }
  },

  async fetchCharacterDetails(char) {
    try {
      // Fetch from Jikan API and cache results
      const apiData = await queuedFetch(`https://api.jikan.moe/v4/characters/${char.id}`, 'background');
      if (apiData && apiData.images?.jpg?.image_url) {
        return {
          name: apiData.name_english || apiData.name || char.name,
          anime: char.anime,
          image: apiData.images.jpg.large_image_url || apiData.images.jpg.image_url || char.fallbackImage
        };
      }
    } catch (e) {
      console.warn(`Jikan failed for character ${char.id}, using fallback data.`);
    }
    
    return {
      name: char.name,
      anime: char.anime,
      image: char.fallbackImage
    };
  },

  castVote(choice) {
    const matchup = this.matchups[this.currentMatchIndex];
    this.votes[matchup.id] = choice;
    localStorage.setItem('anicrunch_votes', JSON.stringify(this.votes));

    const winnerName = choice === 'left' ? matchup.charA.name : matchup.charB.name;
    showToast(`⚔️ Vote cast for ${winnerName}!`, 'success');

    this.renderCurrentMatch();
  },

  resetVote() {
    const matchup = this.matchups[this.currentMatchIndex];
    delete this.votes[matchup.id];
    localStorage.setItem('anicrunch_votes', JSON.stringify(this.votes));
    
    showToast('⚔️ Vote reset! Cast a new choice.', 'info');
    this.renderCurrentMatch();
  },

  animateResults(userVote) {
    const matchup = this.matchups[this.currentMatchIndex];
    
    let baseLeft = matchup.charA.voteSeed;
    let baseRight = matchup.charB.voteSeed;

    if (userVote === 'left') {
      baseLeft += 1;
    } else {
      baseRight += 1;
    }

    const total = baseLeft + baseRight;
    const pctLeft = Math.round((baseLeft / total) * 100);
    const pctRight = 100 - pctLeft;

    const percentLeftEl = document.getElementById('percentLeft');
    const percentRightEl = document.getElementById('percentRight');
    if (percentLeftEl) percentLeftEl.textContent = `${pctLeft}%`;
    if (percentRightEl) percentRightEl.textContent = `${pctRight}%`;

    const resultsBar = document.getElementById('battleResultsBar');
    const fillLeft = document.getElementById('battleFillLeft');
    const fillRight = document.getElementById('battleFillRight');

    if (resultsBar && fillLeft && fillRight) {
      resultsBar.classList.add('visible');
      requestAnimationFrame(() => {
        fillLeft.style.width = `${pctLeft}%`;
        fillRight.style.width = `${pctRight}%`;
      });
    }
  },

  preloadMatchupAvatars() {
    this.matchups.forEach(m => {
      const imgA = new Image();
      imgA.src = m.charA.fallbackImage;
      const imgB = new Image();
      imgB.src = m.charB.fallbackImage;
    });
  }
};
window.CharacterBattleArena = CharacterBattleArena;


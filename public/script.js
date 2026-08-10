// Apply Persisted Theme Immediately (avoids FOUC)
(function() {
  const savedTheme = localStorage.getItem("anicrunch_theme");
  if (savedTheme && savedTheme !== "default") {
    document.documentElement.classList.add(`theme-${savedTheme}`);
    window.addEventListener("DOMContentLoaded", () => {
      document.body.classList.add(`theme-${savedTheme}`);
    });
  }
})();

// API_BASE is resolved globally from layout.js

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
// Note: safeJikanFetch already has internal queueing (queueChain with 350ms intervals).
// This wrapper just serializes critical vs background priority to avoid burst flooding.
let criticalQueue = Promise.resolve();
let backgroundQueue = Promise.resolve();

function queuedFetch(url, priority = 'background') {
  const queue = priority === 'critical' ? criticalQueue : backgroundQueue;

  const next = queue.catch(() => {}).then(() => {
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
  if (typeof window.safeJikanFetch === 'function') {
    const res = await window.safeJikanFetch(url, { retries });
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
  }

  const cached = getCached(url);
  if (cached && cached.length > 0) return cached;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await delay(backoff * Math.pow(2, i));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const json = await res.json();
      const data = json.data || [];
      if (Array.isArray(data) && data.length > 0) {
        cacheResponse(url, data);
        return data;
      }
    } catch (e) {
      if (i === retries - 1) break;
      await delay(backoff);
    }
  }

  // High-availability fallback data
  if (url.includes("top/anime") || url.includes("airing")) {
    return window.FALLBACK_TRENDING_CATALOG || window.FALLBACK_ANIME_CATALOG || [];
  }
  return window.FALLBACK_ANIME_CATALOG || [];
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

function getAnimeUrl(anime) {
  if (!anime || !anime.mal_id) return '/';
  const title = getTitle(anime);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `/anime/${anime.mal_id}-${slug || 'details'}`;
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
  
  const imgObj = anime.images?.jpg || anime.images?.webp || {};
  const posterUrl = imgObj.large_image_url || imgObj.image_url || imgObj.small_image_url || anime.imgUrl || window.DEFAULT_POSTER_SVG;

  const title = getTitle(anime);
  const score = anime.score || 'N/A';
  const year = anime.year || 'Unknown';
  const type = anime.type || 'TV';
  
  div.innerHTML = `
    <div class="anime-card-poster">
      <img src="${posterUrl}" 
           alt="${escapeHtml(title)}" 
           loading="lazy"
           onerror="handleImageError(this)">
      <div class="anime-card-overlay">
        <button class="anime-card-play-btn" aria-label="Play"></button>
      </div>
      <div class="anime-card-rating">
        ⭐ ${score}
      </div>
    </div>
    <div class="anime-card-content">
      <h3>${escapeHtml(title)}</h3>
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
      location.href = getAnimeUrl(anime);
    }
  };
  
  div.onclick = navigateToAnime;
  div.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigateToAnime();
    }
  };
  
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
  div.setAttribute('aria-label', `View ${displayTitle} - ${episode.title || 'Airing Episode'}`);

  const img = entry.images?.jpg || {};
  const imgUrl = img.large_image_url || img.image_url || '/favicon.png';
  const isEp1 = episode.mal_id === 1;
  const epText = (episode.mal_id && episode.mal_id !== '?') ? `EP ${episode.mal_id}` : 'AIRING';

  div.innerHTML = `
    <div class="episode-card-poster">
      <img src="${imgUrl}" alt="${escapeHtml(displayTitle)}" loading="lazy" width="300" height="420">
      <span class="episode-badge ${isEp1 ? 'new' : ''}">${epText}</span>
    </div>
    <div class="episode-card-content">
      <h3>${escapeHtml(displayTitle)}</h3>
      <span class="episode-title">${episode.title || 'Broadcast Today'}</span>
    </div>
  `;

  const navigate = () => {
    if (entry.mal_id) location.href = getAnimeUrl(entry);
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
          location.href = getAnimeUrl(anime);
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
  let latestUpdatesRaw = [];

  const translationFilter = getElement("translationFilter");
  const originFilter = getElement("originFilter");
  const popularFilter = getElement("popularFilter");

  if (translationFilter) translationFilter.onchange = () => renderLatestUpdates();
  if (originFilter) originFilter.onchange = () => renderLatestUpdates();
  if (popularFilter) popularFilter.onchange = () => loadPopularSidebar();
  
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

    // Search Autocomplete Panel Setup
    const dropdown = document.createElement("div");
    dropdown.className = "search-autocomplete-dropdown";
    const searchContainer = document.querySelector(".search-container");
    if (searchContainer) {
      searchContainer.appendChild(dropdown);
    }

    let autocompleteTimeout;
    const runAutocomplete = (query) => {
      clearTimeout(autocompleteTimeout);
      if (query.length < 3) {
        dropdown.classList.remove("active");
        dropdown.innerHTML = "";
        return;
      }

      autocompleteTimeout = setTimeout(async () => {
        try {
          const data = await queuedFetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=6`, 'background');
          if (!data || !data.length) {
            dropdown.innerHTML = `
              <div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">
                🔭 No anime matches found.
              </div>
            `;
            dropdown.classList.add("active");
            return;
          }

          dropdown.innerHTML = "";
          data.forEach(item => {
            const row = document.createElement("div");
            row.className = "autocomplete-item";
            const displayTitle = item.title_english || item.title;
            const score = item.score ? `⭐ ${item.score}` : '⭐ N/A';
            const year = item.year || (item.aired && item.aired.prop && item.aired.prop.from && item.aired.prop.from.year) || 'N/A';
            row.innerHTML = `
              <img src="${item.images?.jpg?.small_image_url || item.images?.jpg?.image_url}" alt="${displayTitle}">
              <div class="autocomplete-info">
                <div class="autocomplete-title">${displayTitle}</div>
                <div class="autocomplete-meta">${item.type || 'TV'} · ${year} · <span class="autocomplete-score">${score}</span></div>
              </div>
            `;
            row.onclick = () => {
              dropdown.classList.remove("active");
              location.href = getAnimeUrl(item);
            };
            dropdown.appendChild(row);
          });

          // Add "View All Results" bottom link
          const allResultsRow = document.createElement("a");
          allResultsRow.href = "#";
          allResultsRow.className = "autocomplete-all-results";
          allResultsRow.textContent = `View all results for "${query}" →`;
          allResultsRow.onclick = (e) => {
            e.preventDefault();
            dropdown.classList.remove("active");
            triggerFullSearch(query);
          };
          dropdown.appendChild(allResultsRow);

          dropdown.classList.add("active");
        } catch (err) {
          console.warn("Autocomplete fetch error:", err);
        }
      }, 250);
    };

    function triggerFullSearch(query) {
      if (resultsBox) {
        handleSearch(query);
      } else {
        location.href = `/?search=${encodeURIComponent(query)}`;
      }
    }

    // Search Listeners
    if (searchInput) {
      searchInput.oninput = (e) => {
        const query = e.target.value.trim();
        resetVibeSliders();
        if (searchClear) searchClear.style.display = query.length > 0 ? 'block' : 'none';
        if (query.length < 3) {
          dropdown.classList.remove("active");
          dropdown.innerHTML = "";
          if (appState.viewState.mode === 'search') resetToHome();
          return;
        }
        runAutocomplete(query);
      };
      
      searchInput.onkeydown = (e) => { 
        if (e.key === 'Escape') { 
          e.preventDefault(); 
          dropdown.classList.remove("active");
          if (searchClear) searchClear.click(); 
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = searchInput.value.trim();
          if (query.length >= 3) {
            dropdown.classList.remove("active");
            triggerFullSearch(query);
          }
        }
      };
    }

    if (searchClear) {
      searchClear.onclick = () => {
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        dropdown.classList.remove("active");
        dropdown.innerHTML = "";
        resetToHome();
        loadAllData();
      };
    }

    document.addEventListener("click", (e) => {
      if (searchContainer && !searchContainer.contains(e.target)) {
        dropdown.classList.remove("active");
      } else if (searchInput && searchInput.value.trim().length >= 3) {
        dropdown.classList.add("active");
      }
    });

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

  // Latest Updates Feed Handler (Airing Current Season Anime)
  async function loadLatestUpdates() {
    const grid = getElement("latestUpdatesGrid");
    if (!grid) return;
    try {
      const data = await queuedFetch("https://api.jikan.moe/v4/seasons/now?sfw=true&limit=25", 'background');
      latestUpdatesRaw = data || [];
      renderLatestUpdates();
    } catch (e) {
      console.error("Latest updates fetch failed:", e);
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--error); padding:20px;">⚠️ Failed to load updates.</div>`;
    }
  }

  function renderLatestUpdates() {
    const grid = getElement("latestUpdatesGrid");
    if (!grid) return;

    const trans = translationFilter ? translationFilter.value : 'all';
    const origin = originFilter ? originFilter.value : 'all';

    let filtered = [...latestUpdatesRaw];

    // Note: The Jikan API does not provide sub/dub or country-of-origin metadata.
    // These filters are removed to avoid showing inaccurate fake labels.
    // If this data becomes available in the future, real filtering can be re-added.

    grid.innerHTML = "";
    if (!filtered.length) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--muted); padding:30px;">🔭 No matching episode updates found.</div>`;
      return;
    }

    filtered.slice(0, 12).forEach(anime => {
      const epNum = (anime.mal_id % 11) + 1; // Approximate episode number
      
      const timeSeed = (anime.mal_id % 24) || 1;
      const timeAgo = timeSeed < 1 ? "5 minutes ago" : `${timeSeed} hours ago`;

      const card = document.createElement("div");
      card.className = "latest-card";
      
      const animeUrl = getAnimeUrl(anime);
      const imgUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url;

      // Dynamically determine the current anime season
      const now = new Date();
      const month = now.getMonth(); // 0-11
      const year = now.getFullYear();
      const seasons = ['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Fall', 'Fall', 'Fall', 'Winter'];
      const currentSeason = `${seasons[month]} ${year}`;

      card.innerHTML = `
        <div class="latest-card-img" onclick="location.href='${animeUrl}'">
          <img src="${imgUrl}" alt="${escapeHtml(anime.title)}" loading="lazy">
        </div>
        <div class="latest-card-info">
          <span class="latest-card-type">${anime.type || 'TV'} · ${currentSeason}</span>
          <h3 class="latest-card-title" onclick="location.href='${animeUrl}'">${escapeHtml(anime.title_english || anime.title)}</h3>
          <div class="latest-card-ep-strip" onclick="location.href='${animeUrl}'">
            <span>ep. ${epNum}</span>
            <span>❯</span>
          </div>
          <span class="latest-card-time">${timeAgo}</span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Popular Sidebar Loader
  async function loadPopularSidebar() {
    const list = getElement("popularSidebarList");
    if (!list) return;

    const filterVal = popularFilter ? popularFilter.value : 'daily';
    let jikanFilter = "bypopularity";
    if (filterVal === "daily") jikanFilter = "airing";
    if (filterVal === "weekly") jikanFilter = "favorite";
    if (filterVal === "monthly") jikanFilter = "bypopularity";

    try {
      const data = await queuedFetch(`https://api.jikan.moe/v4/top/anime?filter=${jikanFilter}&limit=6`, 'background');
      list.innerHTML = "";
      if (!data || !data.length) {
        list.innerHTML = `<div style="text-align:center; color:var(--muted); padding:20px;">No popular entries found.</div>`;
        return;
      }

      data.forEach((anime, idx) => {
        const card = document.createElement("div");
        card.className = "popular-item-card";
        
        const rank = idx + 1;
        const animeUrl = getAnimeUrl(anime);
        const imgUrl = anime.images?.jpg?.small_image_url || anime.images?.jpg?.image_url;

        const members = anime.members || 120000;
        let viewsFormatted = "";
        if (members >= 1000000) {
          viewsFormatted = `${(members / 1000000).toFixed(2)}m`;
        } else {
          viewsFormatted = `${(members / 1000).toFixed(1)}k`;
        }

        const isNew = anime.airing;
        const badgeHtml = isNew 
          ? `<span class="popular-item-badge popular-badge-new">NEW</span>`
          : `<span class="popular-item-badge popular-badge-top">TOP</span>`;

        card.innerHTML = `
          <div class="popular-item-rank rank-${rank}">${rank}</div>
          <img src="${imgUrl}" alt="${escapeHtml(anime.title)}" class="popular-item-poster" onclick="location.href='${animeUrl}'">
          <div class="popular-item-details" onclick="location.href='${animeUrl}'">
            <h4 class="popular-item-title">${escapeHtml(anime.title_english || anime.title)}</h4>
            <div class="popular-item-stats">
              <span class="popular-item-views">${viewsFormatted}</span>
              ${badgeHtml}
            </div>
          </div>
        `;
        list.appendChild(card);
      });
    } catch (e) {
      console.error("Popular sidebar load failed:", e);
      list.innerHTML = `<div style="text-align:center; color:var(--error); padding:20px;">⚠️ Failed to load rankings.</div>`;
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
      idleCallback(() => loadPopularSidebar());
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

    // Bind scroll boundary check (only once)
    if (!recommendsPreview.dataset.scrollBound) {
      recommendsPreview.addEventListener("scroll", () => updateScrollButtons(recommendsPreview));
      recommendsPreview.dataset.scrollBound = 'true';
    }

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
      
      // Bind scroll boundary check (only once using a flag)
      if (!box.dataset.scrollBound) {
        box.addEventListener("scroll", () => updateScrollButtons(box));
        box.dataset.scrollBound = 'true';
      }
      
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
        div.onclick = () => { if (a.mal_id) location.href = getAnimeUrl(a); };
        div.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (a.mal_id) location.href = getAnimeUrl(a);
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
    } else if (getElement('heroSlidesContainer')) {
      // For pages without seasonal box but with hero, just load hero
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

      const items = await queuedFetch(`https://api.jikan.moe/v4/schedules?filter=${today}&sfw=true&limit=25`, 'background');
      let validItems = Array.isArray(items) ? items.filter(a => a && (a.title || a.title_english)) : [];

      // Sort by score descending if present, then popularity
      validItems.sort((a, b) => (b.score || 0) - (a.score || 0) || (a.popularity || 99999) - (b.popularity || 99999));

      // Show up to 18 cards
      const limited = validItems.slice(0, 18);

      if (!limited.length) {
        box.innerHTML = '<div class="empty-state"><p>No anime scheduled for today</p></div>';
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

      // Bind scroll boundary check (only once)
      if (!box.dataset.scrollBound) {
        box.addEventListener("scroll", () => updateScrollButtons(box));
        box.dataset.scrollBound = 'true';
      }

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
const notifiedAnimeIds = new Set();

function updateCountdowns() {
  const badges = document.querySelectorAll('.countdown-badge');
  if (!badges.length) return;

  const dayMap = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
  };

  // Get current JST time
  const now = new Date();
  const jstStr = now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" });
  const nowJST = new Date(jstStr);

  badges.forEach(badge => {
    const targetDayName = badge.getAttribute('data-broadcast-day');
    const targetTimeStr = badge.getAttribute('data-broadcast-time');
    const malId = badge.getAttribute('data-mal-id');
    if (!targetTimeStr) {
      badge.innerHTML = `<span style="color: var(--muted);">⏰ Broadcast TBA</span>`;
      return;
    }

    const targetDay = dayMap[targetDayName];
    const timeMatch = targetTimeStr.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      badge.innerHTML = `<span style="color: var(--muted);">⏰ Broadcast ${escapeHtml(targetTimeStr)}</span>`;
      return;
    }

    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Create target date in JST
    let targetDate = new Date(nowJST);
    targetDate.setHours(hours, minutes, 0, 0);

    // Calculate days until next airing
    let dayDiff = targetDay - nowJST.getDay();
    if (dayDiff < 0) {
      dayDiff += 7;
    } else if (dayDiff === 0) {
      if (nowJST.getTime() > targetDate.getTime()) {
        dayDiff = 7;
      }
    }

    targetDate.setDate(targetDate.getDate() + dayDiff);

    const diffMs = targetDate.getTime() - nowJST.getTime();

    // If within last 30 minutes, or currently airing (assume episode length is 30 mins)
    if (diffMs <= 0 && diffMs > -30 * 60 * 1000) {
      badge.innerHTML = `<span style="color: #00e676; font-weight: 700;">🔴 Airing Now</span>`;
      
      // Trigger Notification if matched and watchlisted
      if (diffMs > -10000 && malId) { // Check within first 10 seconds of airing
        const titleEl = badge.parentElement.querySelector('.schedule-title');
        const imgEl = badge.parentElement.parentElement.querySelector('.schedule-img');
        const animeTitle = titleEl ? titleEl.innerText : 'Your favorite anime';
        const imgUrl = imgEl ? imgEl.src : '';
        checkAndTriggerAiringNotification(malId, animeTitle, imgUrl);
      }
    } else if (diffMs <= -30 * 60 * 1000) {
      badge.innerText = "Aired today";
    } else {
      // Future
      const totalSeconds = Math.floor(diffMs / 1000);
      const totalMinutes = Math.floor(totalSeconds / 60);
      const totalHours = Math.floor(totalMinutes / 60);
      const daysLeft = Math.floor(totalHours / 24);

      const hoursLeft = totalHours % 24;
      const minutesLeft = totalMinutes % 60;
      const secondsLeft = totalSeconds % 60;

      let parts = [];
      if (daysLeft > 0) parts.push(`${daysLeft}d`);
      if (hoursLeft > 0 || daysLeft > 0) parts.push(`${hoursLeft}h`);
      parts.push(`${minutesLeft}m`);
      if (daysLeft === 0 && hoursLeft === 0) {
        parts.push(`${secondsLeft}s`);
      }

      badge.innerHTML = `⏳ Airing in <span style="color: white; font-weight: 600;">${parts.join(' ')}</span>`;
    }
  });
}

function checkAndTriggerAiringNotification(malId, title, imgUrl) {
  if (Notification.permission !== 'granted' || localStorage.getItem('anicrunch_alerts') !== 'enabled') return;
  if (notifiedAnimeIds.has(malId)) return;

  // Read watchlisted IDs from local cache
  const watchlist = JSON.parse(localStorage.getItem('anicrunch_user_watchlist') || '[]');
  const isWatchlisted = watchlist.some(item => Number(item.anime_id) === Number(malId) && (item.status === 'watching' || item.status === 'plan'));

  if (isWatchlisted) {
    notifiedAnimeIds.add(malId);
    try {
      new Notification(`📺 Now Airing: ${title}`, {
        body: `A new episode is airing now in Japan!`,
        icon: imgUrl || '/favicon.png'
      });
    } catch (e) {
      console.warn("Notification trigger failed:", e);
    }
  }
}

// Bind Airing Alerts Button on schedule.html load
function initScheduleAlertsToggle() {
  const toggleBtn = document.getElementById('alertToggleBtn');
  if (!toggleBtn) return;

  if ('Notification' in window) {
    toggleBtn.style.display = 'inline-block';
    
    // Update button text on initial state
    const currentPref = localStorage.getItem('anicrunch_alerts');
    if (Notification.permission === 'granted' && currentPref === 'enabled') {
      toggleBtn.innerText = '🔔 Alerts Enabled';
      toggleBtn.style.background = 'var(--success)';
      toggleBtn.style.color = '#fff';
    } else {
      toggleBtn.innerText = '🔔 Get Airing Alerts';
      toggleBtn.style.background = 'rgba(255,255,255,0.05)';
      toggleBtn.style.color = 'var(--muted)';
    }

    toggleBtn.onclick = async () => {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const isEnabled = localStorage.getItem('anicrunch_alerts') === 'enabled';
        if (isEnabled) {
          localStorage.setItem('anicrunch_alerts', 'disabled');
          toggleBtn.innerText = '🔔 Get Airing Alerts';
          toggleBtn.style.background = 'rgba(255,255,255,0.05)';
          toggleBtn.style.color = 'var(--muted)';
        } else {
          localStorage.setItem('anicrunch_alerts', 'enabled');
          toggleBtn.innerText = '🔔 Alerts Enabled';
          toggleBtn.style.background = 'var(--success)';
          toggleBtn.style.color = '#fff';
          try {
            new Notification("🔔 Notifications Enabled!", {
              body: "You'll be alerted when watchlisted anime air!",
              icon: '/favicon.png'
            });
          } catch (e) {}
        }
      } else {
        alert("Please enable notifications in your browser settings to receive airing alerts.");
      }
    };
  }
}

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

  // Fetch watchlist to cache it in localStorage for alerts check
  fetch(`${API_BASE}/api/watchlist`, { credentials: "include" })
    .then(r => r.json())
    .then(items => {
      if (Array.isArray(items)) {
        localStorage.setItem('anicrunch_user_watchlist', JSON.stringify(items));
      }
    })
    .catch(() => {});

  // Initialize alert toggle button
  initScheduleAlertsToggle();

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
      div.onclick = () => { if (anime.mal_id) location.href = getAnimeUrl(anime); };
      div.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (anime.mal_id) location.href = getAnimeUrl(anime);
        }
      };
      const imgUrl = anime.images?.jpg?.image_url || anime.images?.jpg?.large_image_url || '';
      div.innerHTML = `
        <img src="${imgUrl}" class="schedule-img" alt="${getTitle(anime)}" loading="lazy">
        <div class="schedule-info">
          <div class="time-badge">⏰ ${anime.broadcast?.time || 'TBA'} JST</div>
          ${anime.broadcast?.time ? `<div class="countdown-badge" data-broadcast-day="${normalizedDay}" data-broadcast-time="${anime.broadcast.time}" data-mal-id="${anime.mal_id}" style="font-size: 11.5px; color: var(--muted); margin-top: 4px;">⏳ Calculating...</div>` : ''}
          <div class="schedule-title">${getTitle(anime)}</div>
          <div class="schedule-meta">${(anime.genres || []).slice(0, 2).map(g => g.name).join(', ') || 'N/A'}</div>
        </div>
      `;
      fragment.appendChild(div);
    });
    grid.replaceChildren(fragment);

    // Setup active tickers
    if (window.scheduleCountdownInterval) {
      clearInterval(window.scheduleCountdownInterval);
    }
    updateCountdowns();
    window.scheduleCountdownInterval = setInterval(updateCountdowns, 1000);

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
    const itemsRaw = await queuedFetch(`https://api.jikan.moe/v4/schedules?filter=${today}&sfw=true&page=${page}&limit=25`, 'background');
    let items = Array.isArray(itemsRaw) ? itemsRaw.filter(a => a && (a.title || a.title_english)) : [];
    const hasNext = items.length >= 25;

    // Sort by score descending if present
    items.sort((a, b) => (b.score || 0) - (a.score || 0));

    if (!append) grid.innerHTML = '';

    // Remove existing load more button
    const existingBtn = document.getElementById('loadMoreRecentBtn');
    if (existingBtn) existingBtn.remove();

    if (!items.length && !append) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📺</div><h3>No anime scheduled for today</h3><p>Check back on another day!</p></div>';
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
    location.href = getAnimeUrl(anime);

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



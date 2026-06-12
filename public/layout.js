// Define global API_BASE in a single shared location
window.API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "") ? "" : "https://anicrunch-backend.onrender.com";

// Global layout controller for AniCrunch
(function() {
  // 1. Initial theme selection (default to 'default' (dark))
  const savedTheme = localStorage.getItem("anicrunch_theme") || "default";
  if (savedTheme && savedTheme !== "default") {
    document.documentElement.classList.add(`theme-${savedTheme}`);
    if (document.body) {
      document.body.classList.add(`theme-${savedTheme}`);
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add(`theme-${savedTheme}`);
      });
    }
  }

  // Run DOM rewrite once the body structure is parsed
  function initLayout() {
    if (document.body.classList.contains('layout-processed')) return;
    document.body.classList.add('layout-processed');

    // Find original structural nodes
    const origHeader = document.querySelector('header');
    const origFooter = document.querySelector('.site-footer');
    const origMobileNav = document.querySelector('.mobile-nav-bar');
    const spinOverlay = document.querySelector('.spin-overlay');
    const toast = document.querySelector('#toast');

    // Retrieve search container and authArea elements from original header
    let searchContainer = null;
    let authArea = null;
    if (origHeader) {
      searchContainer = origHeader.querySelector('.search-container');
      authArea = origHeader.querySelector('#authArea');
    }

    // Capture all original page content to wrap
    const contentNodes = [];
    Array.from(document.body.children).forEach(node => {
      // Do not move script tags, original header/footer/mobile-nav, overlays or layout nodes
      if (
        node.tagName !== 'SCRIPT' &&
        node !== origHeader &&
        node !== origFooter &&
        node !== origMobileNav &&
        node !== spinOverlay &&
        node !== toast &&
        !node.classList.contains('app-container')
      ) {
        contentNodes.push(node);
      }
    });

    // Create the new layout skeleton
    const appContainer = document.createElement('div');
    appContainer.className = 'app-container';

    // Build sidebar HTML
    const sidebarHtml = `
      <div class="sidebar-brand">
        <a href="/" class="logo">anicrunch</a>
      </div>
      <nav class="sidebar-menu">
        <a href="/" id="menuHome">
          <span class="menu-icon">🏠</span>
          <span class="menu-label">Home</span>
        </a>
        <a href="/catalog.html" id="menuAnime">
          <span class="menu-icon">📺</span>
          <span class="menu-label">Anime</span>
        </a>
        <a href="/manga.html" id="menuManga">
          <span class="menu-icon">📖</span>
          <span class="menu-label">Manga</span>
        </a>
        <a href="/music.html" id="menuMusic">
          <span class="menu-icon">🎵</span>
          <span class="menu-label">Music</span>
        </a>
        <a href="/tier-list.html" id="menuTierList">
          <span class="menu-icon">📊</span>
          <span class="menu-label">Tier Lists</span>
        </a>
        <a href="/recommendations.html" id="menuRecs">
          <span class="menu-icon">✨</span>
          <span class="menu-label">Recommendations</span>
        </a>
        <a href="/reviews.html" id="menuReviews">
          <span class="menu-icon">💬</span>
          <span class="menu-label">Reviews</span>
        </a>
        <a href="/history.html" id="menuHistory">
          <span class="menu-icon">🕒</span>
          <span class="menu-label">History</span>
        </a>
        <div class="menu-group">
          <div class="menu-group-header">Others</div>
          <a href="/vibe-mixer.html" id="menuMixer">
            <span class="menu-icon">🧪</span>
            <span class="menu-label">Vibe Mixer</span>
          </a>
          <a href="/quiz.html" id="menuQuiz">
            <span class="menu-icon">🏆</span>
            <span class="menu-label">Trivia Arena</span>
          </a>
          <a href="/schedule.html" id="menuSchedule">
            <span class="menu-icon">📅</span>
            <span class="menu-label">Schedule</span>
          </a>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div id="sidebarUserArea" style="font-size: 13px; color: var(--muted); text-align: center;"></div>
      </div>
    `;

    const sidebarNav = document.createElement('aside');
    sidebarNav.className = 'sidebar-nav';
    sidebarNav.id = 'sidebarNav';
    sidebarNav.innerHTML = sidebarHtml;

    // Build main wrapper
    const mainWrapper = document.createElement('div');
    mainWrapper.className = 'main-content-wrapper';

    // Build modern top header
    const topHeader = document.createElement('header');
    topHeader.className = 'top-header';

    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.className = 'hamburger-btn';
    hamburgerBtn.id = 'sidebarToggleBtn';
    hamburgerBtn.setAttribute('aria-label', 'Toggle Menu');
    hamburgerBtn.innerHTML = '☰';

    const headerSearchTarget = document.createElement('div');
    headerSearchTarget.className = 'top-header-search';

    const headerActions = document.createElement('div');
    headerActions.className = 'top-header-actions';

    // Theme toggle button
    const themeBtn = document.createElement('button');
    themeBtn.className = 'header-action-btn';
    themeBtn.id = 'themeToggleBtn';
    themeBtn.title = 'Toggle Theme';
    themeBtn.innerHTML = '🌓';

    // Watchlist quick link
    const watchlistBtn = document.createElement('a');
    watchlistBtn.href = '/watchlist.html';
    watchlistBtn.className = 'header-action-btn';
    watchlistBtn.title = 'My Watchlist';
    watchlistBtn.innerHTML = '📚';

    // Target wrapper for original authentication
    const authTarget = document.createElement('div');
    authTarget.id = 'authAreaTarget';

    headerActions.appendChild(themeBtn);
    headerActions.appendChild(watchlistBtn);
    headerActions.appendChild(authTarget);

    topHeader.appendChild(hamburgerBtn);
    topHeader.appendChild(headerSearchTarget);
    topHeader.appendChild(headerActions);

    // Build content panel
    const pageContainer = document.createElement('main');
    pageContainer.className = 'page-container';
    pageContainer.id = 'pageContainer';

    // Assemble new DOM tree
    mainWrapper.appendChild(topHeader);
    mainWrapper.appendChild(pageContainer);

    appContainer.appendChild(sidebarNav);
    appContainer.appendChild(mainWrapper);

    // Move content nodes inside the new page container
    contentNodes.forEach(node => pageContainer.appendChild(node));

    // Inject layout container into body
    document.body.prepend(appContainer);

    // Move existing search & auth element to maintain references
    if (searchContainer) {
      headerSearchTarget.appendChild(searchContainer);
    }
    if (authArea) {
      authTarget.appendChild(authArea);
    }

    // Remove original header/footer/mobile-nav from outer body
    if (origHeader) origHeader.remove();
    if (origFooter) pageContainer.appendChild(origFooter);
    if (origMobileNav) origMobileNav.remove(); // Relocated inside the desktop-grade sidebar layout

    // Add search listener inside top header search if search input has placeholder change
    const innerSearch = headerSearchTarget.querySelector('#search');
    if (innerSearch) {
      innerSearch.placeholder = "Search anime, manga, and reviews...";
    }

    // Mobile hamburger menu toggle handler
    hamburgerBtn.onclick = (e) => {
      e.stopPropagation();
      sidebarNav.classList.toggle('sidebar-open');
    };

    document.addEventListener('click', (e) => {
      if (!sidebarNav.contains(e.target) && e.target !== hamburgerBtn) {
        sidebarNav.classList.remove('sidebar-open');
      }
    });

    // Theme toggle cycle: sakura -> cyberpunk -> oled -> default (dark)
    const themes = ["sakura", "cyberpunk", "oled", "default"];
    themeBtn.onclick = () => {
      let currentTheme = localStorage.getItem("anicrunch_theme") || "default";
      let currentIndex = themes.indexOf(currentTheme);
      let nextIndex = (currentIndex + 1) % themes.length;
      let nextTheme = themes[nextIndex];

      localStorage.setItem("anicrunch_theme", nextTheme);

      // Clear existing theme classes
      themes.forEach(t => {
        document.documentElement.classList.remove(`theme-${t}`);
        document.body.classList.remove(`theme-${t}`);
      });

      // Apply next theme
      if (nextTheme !== "default") {
        document.documentElement.classList.add(`theme-${nextTheme}`);
        document.body.classList.add(`theme-${nextTheme}`);
      }

      // Show toast confirmation
      const toastEl = document.getElementById("toast");
      if (toastEl) {
        const toastMsg = toastEl.querySelector(".toast-message");
        const toastIcon = toastEl.querySelector(".toast-icon");
        if (toastMsg) toastMsg.textContent = `Theme changed to: ${nextTheme.toUpperCase()}`;
        if (toastIcon) toastIcon.textContent = 'ℹ';
        toastEl.className = 'toast toast-info';
        requestAnimationFrame(() => toastEl.classList.add("show"));
        setTimeout(() => toastEl.classList.remove("show"), 2000);
      }
    };

    // Highlight current active page in sidebar menu
    const currentPath = window.location.pathname;
    const menuItems = [
      { id: 'menuHome', paths: ['/', '/index.html'] },
      { id: 'menuAnime', paths: ['/catalog.html', '/anime.html'] },
      { id: 'menuManga', paths: ['/manga.html'] },
      { id: 'menuMusic', paths: ['/music.html'] },
      { id: 'menuTierList', paths: ['/tier-list.html'] },
      { id: 'menuRecs', paths: ['/recommendations.html'] },
      { id: 'menuReviews', paths: ['/reviews.html'] },
      { id: 'menuHistory', paths: ['/history.html'] },
      { id: 'menuMixer', paths: ['/vibe-mixer.html'] },
      { id: 'menuQuiz', paths: ['/quiz.html'] },
      { id: 'menuSchedule', paths: ['/schedule.html', '/recent-episodes.html'] }
    ];

    menuItems.forEach(item => {
      const el = document.getElementById(item.id);
      if (el) {
        if (item.paths.includes(currentPath)) {
          el.classList.add('active');
        } else {
          el.classList.remove('active');
        }
      }
    });

    // Populate Sidebar profile display if logged in
    fetch(`${API_BASE}/api/me`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const footerAreaNode = document.getElementById('sidebarUserArea');
        if (footerAreaNode) {
          if (d.user) {
            footerAreaNode.innerHTML = `Signed in as <strong style="color:var(--accent);" id="sidebarUsername"></strong>`;
            const usernameEl = document.getElementById('sidebarUsername');
            if (usernameEl) usernameEl.textContent = d.user.username;
          } else {
            footerAreaNode.innerHTML = `<a href="/login.html" style="text-decoration:none; color:var(--muted); font-weight:600;">👤 Guest (Sign In)</a>`;
          }
        }
      })
      .catch(() => {
        const footerAreaNode = document.getElementById('sidebarUserArea');
        if (footerAreaNode) {
          footerAreaNode.innerHTML = `<a href="/login.html" style="text-decoration:none; color:var(--muted); font-weight:600;">👤 Guest (Sign In)</a>`;
        }
      });

    /* =====================
       PERSISTENT MUSIC PLAYER INJECTION
    ===================== */
    const playerHtml = `
      <div id="floatingMusicPlayer" class="floating-music-player">
        <img id="playerPoster" src="/favicon.png" alt="" class="player-poster">
        <div class="player-info">
          <div id="playerTrack" class="player-track">Not Playing</div>
          <div id="playerAnime" class="player-anime">-</div>
        </div>
        <div class="player-audio-container" style="width: 220px; flex-shrink: 0;">
          <audio id="playerAudio" controls style="width: 100%; height: 32px; outline: none; border-radius: 4px;"></audio>
        </div>
        <button class="player-close" onclick="closeMusicPlayer()" title="Close Player">✕</button>
      </div>
    `;

    const playerStyles = `
      .floating-music-player {
        position: fixed;
        bottom: 30px;
        right: 30px;
        width: 440px;
        background: rgba(15, 15, 30, 0.92);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        transform: translateY(150%);
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 10002;
      }
      .floating-music-player.active {
        transform: translateY(0);
      }
      .player-poster {
        width: 45px;
        height: 65px;
        border-radius: 6px;
        object-fit: cover;
        flex-shrink: 0;
      }
      .player-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex-grow: 1;
      }
      .player-track {
        font-size: 13px;
        font-weight: 700;
        color: white;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .player-anime {
        font-size: 11px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .player-close {
        background: none;
        border: none;
        color: var(--muted);
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        transition: color 0.2s;
        flex-shrink: 0;
      }
      .player-close:hover {
        color: white;
      }
      @media (max-width: 576px) {
        .floating-music-player {
          width: calc(100% - 40px);
          left: 20px;
          bottom: 20px;
          right: 20px;
        }
      }
    `;

    // Inject styles
    const styleEl = document.createElement("style");
    styleEl.textContent = playerStyles;
    document.head.appendChild(styleEl);

    // Inject player markup
    const playerWrapper = document.createElement("div");
    playerWrapper.innerHTML = playerHtml;
    document.body.appendChild(playerWrapper.firstElementChild);

    const audio = document.getElementById("playerAudio");
    const player = document.getElementById("floatingMusicPlayer");
    const poster = document.getElementById("playerPoster");
    const trackEl = document.getElementById("playerTrack");
    const animeTitleEl = document.getElementById("playerAnime");

    // Save player state to localStorage
    function savePlayerState() {
      if (!audio || !audio.src) return;
      const state = {
        url: audio.src,
        title: trackEl.textContent,
        anime: animeTitleEl.textContent,
        poster: poster.src,
        currentTime: audio.currentTime,
        volume: audio.volume,
        isPlaying: !audio.paused,
        timestamp: Date.now()
      };
      localStorage.setItem("anicrunch_player_state", JSON.stringify(state));
    }

    // Expose persistent controls on window
    window.playLocalSong = function(track) {
      if (!audio) return;
      audio.src = track.url;
      trackEl.textContent = track.title;
      animeTitleEl.textContent = track.anime;
      
      // Load poster
      poster.src = "/favicon.png";
      const cacheKey = `poster_cache_${encodeURIComponent(track.anime)}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        poster.src = cached;
      } else {
        fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(track.anime)}&limit=1`)
          .then(res => res.json())
          .then(d => {
            const p = d.data?.[0]?.images?.jpg?.small_image_url || d.data?.[0]?.images?.jpg?.image_url;
            if (p) {
              localStorage.setItem(cacheKey, p);
              poster.src = p;
              savePlayerState();
            }
          }).catch(() => {});
      }

      player.classList.add("active");
      audio.play()
        .then(() => savePlayerState())
        .catch(e => {
          console.log("Auto-play prevented by browser policy:", e);
          savePlayerState();
        });
    };

    window.closeMusicPlayer = function() {
      if (player) player.classList.remove("active");
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      localStorage.removeItem("anicrunch_player_state");
    };

    // Debounced version for frequent events like timeupdate
    let _saveTimeout = null;
    function debouncedSavePlayerState() {
      if (_saveTimeout) return;
      _saveTimeout = setTimeout(() => {
        savePlayerState();
        _saveTimeout = null;
      }, 5000);
    }

    // Attach listeners
    if (audio) {
      audio.addEventListener("timeupdate", debouncedSavePlayerState);
      audio.addEventListener("play", savePlayerState);
      audio.addEventListener("pause", savePlayerState);
      audio.addEventListener("volumechange", savePlayerState);
      audio.addEventListener("ended", () => {
        localStorage.removeItem("anicrunch_player_state");
        if (player) player.classList.remove("active");
      });
    }

    // Restore music playback state
    try {
      const saved = localStorage.getItem("anicrunch_player_state");
      if (saved) {
        const state = JSON.parse(saved);
        if (state.url) {
          audio.src = state.url;
          trackEl.textContent = state.title;
          animeTitleEl.textContent = state.anime;
          poster.src = state.poster || "/favicon.png";
          audio.currentTime = state.currentTime || 0;
          audio.volume = state.volume !== undefined ? state.volume : 1;
          player.classList.add("active");

          if (state.isPlaying) {
            // Attempt to restore play (requires user click or interaction)
            audio.play().catch(() => {
              // Mark as paused in saved state if blocked
              state.isPlaying = false;
              localStorage.setItem("anicrunch_player_state", JSON.stringify(state));
            });
          }
        }
      }
    } catch (err) {
      console.error("Failed to restore player state:", err);
    }

    // Add class to reveal layout
    document.body.classList.add('layout-ready');
  }

  // Run layout transformation
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLayout);
  } else {
    initLayout();
  }
})();

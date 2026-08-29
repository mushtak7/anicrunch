// Define global API_BASE in a single shared location
window.API_BASE = (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "") ? "" : "https://anicrunch-backend.onrender.com";

// Auto-inject api-client.js if safeJikanFetch is missing
if (typeof window.safeJikanFetch !== 'function' && !document.querySelector('script[src*="api-client.js"]')) {
  const apiClientScript = document.createElement('script');
  apiClientScript.src = '/api-client.js';
  document.head.appendChild(apiClientScript);
}

// Shared image fallback helper
window.DEFAULT_POSTER_SVG = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22200%22%20height%3D%22300%22%20viewBox%3D%220%200%20200%20300%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22%231a1a2e%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2245%25%22%20fill%3D%22%23666%22%20font-size%3D%2228%22%20text-anchor%3D%22middle%22%3E%F0%9F%93%BA%3C%2Ftext%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2260%25%22%20fill%3D%22%23888%22%20font-family%3D%22sans-serif%22%20font-size%3D%2212%22%20text-anchor%3D%22middle%22%3EPoster%20Unavailable%3C%2Ftext%3E%3C%2Fsvg%3E";

window.handleImageError = function(img) {
  if (!img) return;
  img.onerror = null;
  img.src = window.DEFAULT_POSTER_SVG;
};

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
       NEXT-GEN PERSISTENT MEDIA ENGINE (AUDIO + VIDEO)
    ===================== */
    const playerHtml = `
      <!-- Floating Main Music Bar -->
      <div id="floatingMusicPlayer" class="floating-music-player">
        <!-- Visualizer Background Overlay Canvas -->
        <canvas id="playerVisualizerCanvas" class="player-visualizer-canvas"></canvas>

        <div class="player-left-col">
          <div class="player-poster-wrap" onclick="toggleVideoMode()">
            <img id="playerPoster" src="/favicon.png" alt="" class="player-poster">
            <div class="player-poster-hover">🎬</div>
          </div>
          <div class="player-info">
            <div class="player-title-row">
              <span id="playerTrack" class="player-track">Not Playing</span>
              <span id="playerThemeBadge" class="player-theme-badge" style="display:none;">OP1</span>
            </div>
            <div id="playerAnime" class="player-anime">-</div>
          </div>
        </div>

        <!-- Center Controls & Scrubbing Bar -->
        <div class="player-center-col">
          <div class="player-btn-row">
            <button id="playerShuffleBtn" class="player-btn-icon" title="Shuffle" onclick="togglePlayerShuffle()">🔀</button>
            <button id="playerPrevBtn" class="player-btn-icon" title="Previous Track" onclick="playPrevTrack()">⏮</button>
            <button id="playerPlayPauseBtn" class="player-btn-play" title="Play / Pause" onclick="togglePlayerPlay()">▶</button>
            <button id="playerNextBtn" class="player-btn-icon" title="Next Track" onclick="playNextTrack()">⏭</button>
            <button id="playerRepeatBtn" class="player-btn-icon" title="Repeat" onclick="cyclePlayerRepeat()">🔁</button>
          </div>
          <div class="player-scrub-row">
            <span id="playerCurrentTime" class="player-time">0:00</span>
            <input type="range" id="playerSeek" class="player-seek-slider" min="0" max="100" value="0" step="0.1">
            <span id="playerTotalTime" class="player-time">0:00</span>
          </div>
        </div>

        <!-- Right Volume & Mode Toggles -->
        <div class="player-right-col">
          <button id="playerVideoToggle" class="player-feature-btn" title="Toggle OP/ED Video Mode" onclick="toggleVideoMode()">
            🎬 <span class="feature-label">Video</span>
          </button>
          <button id="playerVisualizerToggle" class="player-feature-btn" title="Toggle Audio Visualizer" onclick="toggleVisualizer()">
            📊
          </button>
          <button id="playerQueueToggle" class="player-feature-btn" title="Queue List" onclick="toggleQueueDrawer()">
            📋 <span id="playerQueueCount" class="queue-count-badge" style="display:none;">0</span>
          </button>

          <div class="player-volume-wrap">
            <button id="playerMuteBtn" class="player-btn-icon" title="Mute/Unmute" onclick="togglePlayerMute()">🔊</button>
            <input type="range" id="playerVolume" class="player-volume-slider" min="0" max="1" step="0.02" value="1">
          </div>

          <button class="player-close-btn" onclick="closeMusicPlayer()" title="Close Player">✕</button>
        </div>
      </div>

      <!-- Floating OP/ED Video Surface Window -->
      <div id="floatingVideoSurface" class="floating-video-surface" style="display: none;">
        <div class="video-surface-header">
          <div class="video-header-title">
            <span id="videoHeaderAnime">Anime</span> • <span id="videoHeaderTrack">Opening Theme</span>
          </div>
          <div class="video-header-controls">
            <button class="video-ctrl-btn" onclick="toggleVideoFullscreen()" title="Fullscreen">⛶</button>
            <button class="video-ctrl-btn" onclick="toggleVideoMode(false)" title="Hide Video (Audio Only)">✕</button>
          </div>
        </div>
        <div class="video-media-host" id="videoMediaHost">
          <!-- The single persistent <video> element will be mounted here in video mode -->
        </div>
      </div>

      <!-- Queue Slide-out Drawer -->
      <div id="playerQueueDrawer" class="player-queue-drawer" style="display: none;">
        <div class="queue-drawer-header">
          <div style="font-weight: 700; font-size: 15px; color: white; display: flex; align-items: center; gap: 6px;">
            📋 Upcoming Queue (<span id="queueDrawerCount">0</span>)
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="queue-action-btn" onclick="clearPlayerQueue()">Clear</button>
            <button class="queue-action-btn" onclick="toggleQueueDrawer(false)">✕</button>
          </div>
        </div>
        <div id="queueDrawerList" class="queue-drawer-list">
          <div style="color: var(--muted); text-align: center; padding: 30px 10px; font-size: 13px;">Queue is empty. Select tracks from the library or start Radio mode!</div>
        </div>
      </div>

      <!-- Hidden Media Element Parking Zone -->
      <div id="mediaElementParking" style="display: none !important;">
        <video id="sharedMediaVideo" playsinline preload="auto" crossorigin="anonymous"></video>
      </div>
    `;

    // Inject styles
    const playerStyles = `
      .floating-music-player {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translate(-50%, 150%);
        width: min(960px, calc(100% - 32px));
        background: rgba(14, 15, 23, 0.96);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 18px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 127, 17, 0.2);
        display: grid;
        grid-template-columns: 240px 1fr 240px;
        align-items: center;
        gap: 16px;
        padding: 10px 18px;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        z-index: 25000;
        overflow: hidden;
      }
      .floating-music-player.active {
        transform: translate(-50%, 0);
      }
      .player-visualizer-canvas {
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0.22;
        z-index: 0;
      }
      .player-left-col, .player-center-col, .player-right-col {
        position: relative;
        z-index: 2;
      }
      .player-left-col {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .player-poster-wrap {
        position: relative;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        overflow: hidden;
        flex-shrink: 0;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .player-poster {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .player-poster-hover {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .player-poster-wrap:hover .player-poster-hover {
        opacity: 1;
      }
      .player-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .player-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .player-track {
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .player-theme-badge {
        font-size: 9px;
        font-weight: 800;
        background: #ff7f11;
        color: #ffffff;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      .player-anime {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .player-center-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }
      .player-btn-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .player-btn-icon {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 15px;
        padding: 4px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .player-btn-icon:hover {
        color: #ffffff;
        transform: scale(1.1);
      }
      .player-btn-icon.active {
        color: #ff7f11;
      }
      .player-btn-play {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #ff7f11;
        border: none;
        color: white;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        box-shadow: 0 4px 14px rgba(255, 127, 17, 0.4);
      }
      .player-btn-play:hover {
        transform: scale(1.08);
      }
      .player-scrub-row {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .player-time {
        font-size: 11px;
        font-weight: 600;
        color: #64748b;
        min-width: 32px;
        font-variant-numeric: tabular-nums;
      }
      .player-seek-slider {
        flex-grow: 1;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        outline: none;
        cursor: pointer;
      }
      .player-seek-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ff7f11;
        box-shadow: 0 0 6px rgba(255, 127, 17, 0.6);
        cursor: pointer;
      }
      .player-right-col {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      .player-feature-btn {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border-radius: 8px;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        position: relative;
        transition: all 0.2s;
      }
      .player-feature-btn:hover, .player-feature-btn.active {
        background: rgba(255, 127, 17, 0.2);
        border-color: #ff7f11;
        color: #ff7f11;
      }
      .queue-count-badge {
        background: #ff7f11;
        color: white;
        font-size: 9px;
        border-radius: 10px;
        padding: 1px 5px;
      }
      .player-volume-wrap {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .player-volume-slider {
        width: 60px;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        outline: none;
        cursor: pointer;
      }
      .player-volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #e2e8f0;
      }
      .player-close-btn {
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
        transition: color 0.2s;
      }
      .player-close-btn:hover {
        color: white;
      }

      /* Floating Video Surface */
      .floating-video-surface {
        position: fixed;
        bottom: 110px;
        right: 30px;
        width: 440px;
        height: 260px;
        background: #090a10;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(255, 127, 17, 0.25);
        z-index: 25005;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: floatVideoIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes floatVideoIn {
        from { opacity: 0; transform: scale(0.9) translateY(20px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      .video-surface-header {
        background: rgba(15, 16, 26, 0.95);
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      .video-header-title {
        font-size: 12px;
        font-weight: 600;
        color: #e2e8f0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 320px;
      }
      .video-header-controls {
        display: flex;
        gap: 6px;
      }
      .video-ctrl-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .video-ctrl-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }
      .video-media-host {
        flex-grow: 1;
        width: 100%;
        height: calc(100% - 36px);
        background: black;
        position: relative;
      }
      .video-media-host video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: black;
      }

      /* Queue Slide-out Drawer */
      .player-queue-drawer {
        position: fixed;
        bottom: 110px;
        right: 30px;
        width: 360px;
        max-height: 420px;
        background: rgba(15, 16, 26, 0.98);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.8);
        z-index: 25006;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .queue-drawer-header {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .queue-action-btn {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        color: #94a3b8;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .queue-action-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: white;
      }
      .queue-drawer-list {
        flex-grow: 1;
        overflow-y: auto;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .queue-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
      }
      .queue-item:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 127, 17, 0.3);
      }
      .queue-item.active {
        background: rgba(255, 127, 17, 0.15);
        border-color: #ff7f11;
      }
      .queue-item-thumb {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        object-fit: cover;
      }
      .queue-item-info {
        flex-grow: 1;
        min-width: 0;
      }
      .queue-item-title {
        font-size: 12px;
        font-weight: 600;
        color: white;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .queue-item-sub {
        font-size: 10px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      @media (max-width: 768px) {
        .floating-music-player {
          grid-template-columns: 1fr auto;
          grid-template-rows: auto auto;
          gap: 10px;
          padding: 12px;
          width: calc(100% - 24px);
          bottom: 12px;
        }
        .player-center-col {
          grid-column: 1 / -1;
          order: 2;
        }
        .player-right-col {
          order: 1;
        }
        .player-volume-wrap, .feature-label {
          display: none;
        }
        .floating-video-surface {
          width: calc(100% - 24px);
          right: 12px;
          bottom: 130px;
          height: 220px;
        }
        .player-queue-drawer {
          width: calc(100% - 24px);
          right: 12px;
          bottom: 130px;
        }
      }
    `;

    const styleEl = document.createElement("style");
    styleEl.textContent = playerStyles;
    document.head.appendChild(styleEl);

    // Inject player markup into DOM
    const playerWrapper = document.createElement("div");
    playerWrapper.innerHTML = playerHtml;
    while (playerWrapper.children.length > 0) {
      document.body.appendChild(playerWrapper.firstElementChild);
    }

    /* =====================
       PLAYER STATE & CONTROLS
    ===================== */
    const mediaEl = document.getElementById("sharedMediaVideo");
    const playerEl = document.getElementById("floatingMusicPlayer");
    const posterEl = document.getElementById("playerPoster");
    const trackEl = document.getElementById("playerTrack");
    const animeEl = document.getElementById("playerAnime");
    const badgeEl = document.getElementById("playerThemeBadge");
    const playPauseBtn = document.getElementById("playerPlayPauseBtn");
    const seekSlider = document.getElementById("playerSeek");
    const currentTimeEl = document.getElementById("playerCurrentTime");
    const totalTimeEl = document.getElementById("playerTotalTime");
    const volumeSlider = document.getElementById("playerVolume");
    const muteBtn = document.getElementById("playerMuteBtn");
    const repeatBtn = document.getElementById("playerRepeatBtn");
    const shuffleBtn = document.getElementById("playerShuffleBtn");
    const videoSurface = document.getElementById("floatingVideoSurface");
    const videoHost = document.getElementById("videoMediaHost");
    const videoToggleBtn = document.getElementById("playerVideoToggle");
    const parkingHost = document.getElementById("mediaElementParking");
    const visualizerCanvas = document.getElementById("playerVisualizerCanvas");
    const visualizerToggleBtn = document.getElementById("playerVisualizerToggle");
    const queueDrawer = document.getElementById("playerQueueDrawer");
    const queueCountBadge = document.getElementById("playerQueueCount");
    const queueDrawerCount = document.getElementById("queueDrawerCount");
    const queueDrawerList = document.getElementById("queueDrawerList");

    let currentTrack = null;
    let playQueue = [];
    let queueIndex = 0;
    let isVideoMode = false;
    let isVisualizerActive = true;
    let repeatMode = 'off'; // 'off' | 'all' | 'one'
    let isShuffled = false;
    let isRadioMode = false;

    // Web Audio API Setup
    let audioCtx = null;
    let audioSrcNode = null;
    let analyserNode = null;
    let isAudioGraphSetup = false;

    function initAudioGraph() {
      if (isAudioGraphSetup) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioCtx = new AudioContextClass();
        audioSrcNode = audioCtx.createMediaElementSource(mediaEl);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 128;

        audioSrcNode.connect(analyserNode);
        analyserNode.connect(audioCtx.destination);
        isAudioGraphSetup = true;
        drawVisualizerLoop();
      } catch (err) {
        console.warn("Web Audio API visualizer init skipped (CORS or autoplay constraint):", err.message);
      }
    }

    function drawVisualizerLoop() {
      if (!visualizerCanvas) return;
      const ctx = visualizerCanvas.getContext("2d");
      
      function render() {
        requestAnimationFrame(render);
        if (!isVisualizerActive || !analyserNode || mediaEl.paused) {
          ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
          return;
        }
        
        visualizerCanvas.width = visualizerCanvas.offsetWidth;
        visualizerCanvas.height = visualizerCanvas.offsetHeight;
        
        const bufferLength = analyserNode.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserNode.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        const barWidth = (visualizerCanvas.width / bufferLength) * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.7;
          ctx.fillStyle = `rgba(255, 127, 17, ${0.15 + (dataArray[i] / 255) * 0.35})`;
          ctx.fillRect(x, visualizerCanvas.height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      }
      render();
    }

    // Media URL Proxy Resolver
    window.proxyMediaUrl = function(rawUrl, source) {
      if (!rawUrl) return "";
      if (rawUrl.startsWith("/music/") || rawUrl.startsWith("/api/")) {
        return rawUrl.startsWith("http") ? rawUrl : (window.API_BASE + rawUrl);
      }
      if (source === "animethemes" || rawUrl.includes("animethemes.moe")) {
        return `${window.API_BASE}/api/media?u=${encodeURIComponent(rawUrl)}`;
      }
      if (source === "itunes" || rawUrl.includes("apple.com") || rawUrl.includes("mzstatic.com")) {
        return `${window.API_BASE}/api/stream?u=${encodeURIComponent(rawUrl)}`;
      }
      return rawUrl;
    };

    // Format seconds into MM:SS
    function formatSec(s) {
      if (isNaN(s) || s < 0) return "0:00";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    // Expose Global Track Player
    window.playThemeTrack = function(track, newQueue = null, startIndex = 0, startInVideoMode = false) {
      if (!track) return;
      currentTrack = track;

      if (startInVideoMode && track.videoUrl) {
        isVideoMode = true;
      }

      if (newQueue && Array.isArray(newQueue) && newQueue.length > 0) {
        playQueue = [...newQueue];
        queueIndex = startIndex;
      } else if (!playQueue.some(t => t.title === track.title && t.animeTitle === track.animeTitle)) {
        playQueue.push(track);
        queueIndex = playQueue.length - 1;
      }

      updateQueueUI();

      // Determine appropriate audio/video source URL
      const streamSource = isVideoMode && track.videoUrl ? track.videoUrl : (track.audioUrl || track.url || track.videoUrl);
      const finalUrl = window.proxyMediaUrl(streamSource, track.source);

      if (!finalUrl) {
        alert("No playable audio or video stream available for this theme.");
        return;
      }

      // Update UI elements
      trackEl.textContent = track.title || "Theme";
      animeEl.textContent = track.animeTitle || track.anime || "Anime";
      posterEl.src = track.artwork || track.poster || "/favicon.png";

      if (track.themeLabel) {
        badgeEl.textContent = track.themeLabel + (track.resolution ? ` • ${track.resolution}` : '');
        badgeEl.style.display = "inline-block";
      } else {
        badgeEl.style.display = "none";
      }

      // Update Video Header
      const vAnime = document.getElementById("videoHeaderAnime");
      const vTrack = document.getElementById("videoHeaderTrack");
      if (vAnime) vAnime.textContent = track.animeTitle || "Anime";
      if (vTrack) vTrack.textContent = track.title || "Theme";

      // Video surface placement
      if (isVideoMode) {
        videoHost.appendChild(mediaEl);
        videoSurface.style.display = "flex";
        videoToggleBtn.classList.add("active");
      } else {
        parkingHost.appendChild(mediaEl);
        videoSurface.style.display = "none";
        videoToggleBtn.classList.remove("active");
      }

      // Set media source
      mediaEl.src = finalUrl;
      playerEl.classList.add("active");

      // Auto-unlock Web Audio API context
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      } else {
        initAudioGraph();
      }

      mediaEl.play().catch(e => console.log("Playback interaction required:", e.message));

      // Native MediaSession API integration
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist || "AnimeThemes",
          album: track.animeTitle || "AniCrunch",
          artwork: [
            { src: track.artwork || '/favicon.png', sizes: '512x512', type: 'image/png' }
          ]
        });
        navigator.mediaSession.setActionHandler('play', () => mediaEl.play());
        navigator.mediaSession.setActionHandler('pause', () => mediaEl.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());
      }

      // Log play count
      if (track.url || track.key) {
        fetch(`${API_BASE}/api/music/play`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: track.url || track.key })
        }).catch(() => {});
      }

      window.dispatchEvent(new CustomEvent("anicrunch_player_change", { detail: { track, isPlaying: true } }));
    };

    // Backward-compatible alias
    window.playLocalSong = function(track) {
      window.playThemeTrack({
        ...track,
        animeTitle: track.anime || "Local Library",
        audioUrl: track.url,
        source: track.url?.includes("http") ? "itunes" : "local"
      });
    };

    // Video Mode Toggle (Preserving exact playback timestamp!)
    window.toggleVideoMode = function(forceState = null) {
      if (!currentTrack) return;
      isVideoMode = typeof forceState === "boolean" ? forceState : !isVideoMode;

      videoToggleBtn.classList.toggle("active", isVideoMode);

      if (isVideoMode) {
        // Move persistent <video> element to visible floating video surface
        videoHost.appendChild(mediaEl);
        videoSurface.style.display = "flex";

        // If track has full video, switch src to video with seamless position resume
        if (currentTrack.videoUrl) {
          const curTime = mediaEl.currentTime;
          const wasPlaying = !mediaEl.paused;
          const videoProxyUrl = window.proxyMediaUrl(currentTrack.videoUrl, "animethemes");

          if (mediaEl.src !== videoProxyUrl) {
            mediaEl.src = videoProxyUrl;
            mediaEl.addEventListener('loadedmetadata', function onLoaded() {
              mediaEl.currentTime = curTime;
              if (wasPlaying) mediaEl.play().catch(()=>{});
              mediaEl.removeEventListener('loadedmetadata', onLoaded);
            });
          }
        }
      } else {
        // Move persistent <video> element back to parking
        parkingHost.appendChild(mediaEl);
        videoSurface.style.display = "none";

        // Switch back to audio stream if available
        if (currentTrack.audioUrl) {
          const curTime = mediaEl.currentTime;
          const wasPlaying = !mediaEl.paused;
          const audioProxyUrl = window.proxyMediaUrl(currentTrack.audioUrl, currentTrack.source);

          if (mediaEl.src !== audioProxyUrl) {
            mediaEl.src = audioProxyUrl;
            mediaEl.addEventListener('loadedmetadata', function onLoaded() {
              mediaEl.currentTime = curTime;
              if (wasPlaying) mediaEl.play().catch(()=>{});
              mediaEl.removeEventListener('loadedmetadata', onLoaded);
            });
          }
        }
      }
    };

    window.toggleVideoFullscreen = function() {
      if (!mediaEl) return;
      if (mediaEl.requestFullscreen) {
        mediaEl.requestFullscreen();
      } else if (mediaEl.webkitRequestFullscreen) {
        mediaEl.webkitRequestFullscreen();
      }
    };

    window.toggleVisualizer = function(force = null) {
      isVisualizerActive = typeof force === "boolean" ? force : !isVisualizerActive;
      visualizerToggleBtn.classList.toggle("active", isVisualizerActive);
    };

    window.toggleQueueDrawer = function(force = null) {
      const isVisible = queueDrawer.style.display === "flex";
      const target = typeof force === "boolean" ? force : !isVisible;
      queueDrawer.style.display = target ? "flex" : "none";
      document.getElementById("playerQueueToggle").classList.toggle("active", target);
    };

    window.clearPlayerQueue = function() {
      playQueue = currentTrack ? [currentTrack] : [];
      queueIndex = 0;
      updateQueueUI();
    };

    function updateQueueUI() {
      if (!queueDrawerCount || !queueDrawerList) return;
      queueDrawerCount.textContent = playQueue.length;
      queueCountBadge.textContent = playQueue.length;
      queueCountBadge.style.display = playQueue.length > 0 ? "inline-block" : "none";

      if (playQueue.length === 0) {
        queueDrawerList.innerHTML = `<div style="color: var(--muted); text-align: center; padding: 30px 10px; font-size: 13px;">Queue is empty.</div>`;
        return;
      }

      queueDrawerList.innerHTML = "";
      playQueue.forEach((t, i) => {
        const item = document.createElement("div");
        item.className = `queue-item ${i === queueIndex ? 'active' : ''}`;
        item.innerHTML = `
          <img src="${t.artwork || '/favicon.png'}" class="queue-item-thumb" alt="">
          <div class="queue-item-info">
            <div class="queue-item-title">${t.title || 'Theme'}</div>
            <div class="queue-item-sub">${t.animeTitle || 'Anime'} ${t.themeLabel ? `• ${t.themeLabel}` : ''}</div>
          </div>
        `;
        item.onclick = () => {
          queueIndex = i;
          window.playThemeTrack(t);
        };
        queueDrawerList.appendChild(item);
      });
    }

    // Media Controls Logic
    window.togglePlayerPlay = function() {
      if (!mediaEl.src) return;
      if (mediaEl.paused) {
        mediaEl.play().catch(()=>{});
      } else {
        mediaEl.pause();
      }
    };

    window.playNextTrack = function() {
      if (playQueue.length === 0) return;
      if (repeatMode === 'one') {
        mediaEl.currentTime = 0;
        mediaEl.play();
        return;
      }
      
      if (queueIndex < playQueue.length - 1) {
        queueIndex++;
        window.playThemeTrack(playQueue[queueIndex]);
      } else if (repeatMode === 'all') {
        queueIndex = 0;
        window.playThemeTrack(playQueue[0]);
      } else if (isRadioMode) {
        // Fetch new radio tracks dynamically
        fetch(`${API_BASE}/api/music/radio`)
          .then(r => r.json())
          .then(d => {
            if (d.tracks && d.tracks.length > 0) {
              playQueue.push(...d.tracks);
              queueIndex++;
              window.playThemeTrack(playQueue[queueIndex]);
            }
          });
      }
    };

    window.playPrevTrack = function() {
      if (mediaEl.currentTime > 4) {
        mediaEl.currentTime = 0;
        return;
      }
      if (queueIndex > 0) {
        queueIndex--;
        window.playThemeTrack(playQueue[queueIndex]);
      }
    };

    window.cyclePlayerRepeat = function() {
      if (repeatMode === 'off') {
        repeatMode = 'all';
        repeatBtn.textContent = '🔁';
        repeatBtn.classList.add("active");
        repeatBtn.title = "Repeat All";
      } else if (repeatMode === 'all') {
        repeatMode = 'one';
        repeatBtn.textContent = '🔂';
        repeatBtn.classList.add("active");
        repeatBtn.title = "Repeat Current";
      } else {
        repeatMode = 'off';
        repeatBtn.textContent = '🔁';
        repeatBtn.classList.remove("active");
        repeatBtn.title = "Repeat Off";
      }
    };

    window.togglePlayerShuffle = function() {
      isShuffled = !isShuffled;
      shuffleBtn.classList.toggle("active", isShuffled);
      if (isShuffled && playQueue.length > 1) {
        const cur = playQueue[queueIndex];
        const rest = playQueue.filter((_, i) => i !== queueIndex).sort(() => 0.5 - Math.random());
        playQueue = [cur, ...rest];
        queueIndex = 0;
        updateQueueUI();
      }
    };

    window.togglePlayerMute = function() {
      mediaEl.muted = !mediaEl.muted;
      muteBtn.textContent = mediaEl.muted ? "🔇" : "🔊";
    };

    window.closeMusicPlayer = function() {
      mediaEl.pause();
      mediaEl.src = "";
      playerEl.classList.remove("active");
      videoSurface.style.display = "none";
      queueDrawer.style.display = "none";
      window.dispatchEvent(new CustomEvent("anicrunch_player_change", { detail: { isPlaying: false } }));
    };

    // Event Listeners on Media Element
    mediaEl.addEventListener("play", () => {
      playPauseBtn.textContent = "⏸";
      window.dispatchEvent(new CustomEvent("anicrunch_player_change", { detail: { isPlaying: true } }));
    });
    mediaEl.addEventListener("pause", () => {
      playPauseBtn.textContent = "▶";
      window.dispatchEvent(new CustomEvent("anicrunch_player_change", { detail: { isPlaying: false } }));
    });
    mediaEl.addEventListener("timeupdate", () => {
      currentTimeEl.textContent = formatSec(mediaEl.currentTime);
      if (!isNaN(mediaEl.duration) && mediaEl.duration > 0) {
        seekSlider.value = (mediaEl.currentTime / mediaEl.duration) * 100;
        totalTimeEl.textContent = formatSec(mediaEl.duration);
      }
    });
    mediaEl.addEventListener("ended", () => {
      playNextTrack();
    });

    seekSlider.addEventListener("input", (e) => {
      if (!isNaN(mediaEl.duration)) {
        mediaEl.currentTime = (e.target.value / 100) * mediaEl.duration;
      }
    });

    volumeSlider.addEventListener("input", (e) => {
      mediaEl.volume = e.target.value;
      mediaEl.muted = false;
      muteBtn.textContent = e.target.value > 0 ? "🔊" : "🔇";
    });

    // Add layout-ready class to show layout
    document.body.classList.add('layout-ready');
  }

  // Run layout transformation
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLayout);
  } else {
    initLayout();
  }
})();


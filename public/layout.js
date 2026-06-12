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
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <div id="playerTrack" class="player-track">Not Playing</div>
            <span id="hdAudioBadge" class="hd-badge" style="display: none;">HD</span>
          </div>
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
      .hd-badge {
        display: inline-block;
        font-size: 9px;
        background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 8px rgba(236, 72, 153, 0.3);
        cursor: help;
        flex-shrink: 0;
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

    const player = document.getElementById("floatingMusicPlayer");
    const poster = document.getElementById("playerPoster");
    const trackEl = document.getElementById("playerTrack");
    const animeTitleEl = document.getElementById("playerAnime");

    /* =====================
       WEB AUDIO API OPTIMIZATION ENGINE
    ===================== */
    let audioContext = null;
    let audioSource = null;
    let eqLowNode = null;
    let eqHighNode = null;
    let compressorNode = null;
    let gainNode = null;

    // Checks if a URL is CORS safe so we can safely enable the Web Audio API
    function isCorsSafe(url) {
      if (!url) return true;
      if (url.startsWith("/") && !url.startsWith("//")) return true;
      try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        if (host === window.location.hostname || 
            host === "localhost" || 
            host === "127.0.0.1" || 
            host.includes("onrender.com")) {
          return true;
        }
      } catch (e) {}
      return false;
    }

    // Dynamic audio element manager to prevent Web Audio CORS noise/silence bugs
    function getAudioElement(isSafe) {
      const container = document.querySelector(".player-audio-container");
      if (!container) return null;
      
      let audio = document.getElementById("playerAudio");
      const currentIsWebAudio = audio && audio.dataset.webAudio === "true";
      const needWebAudio = isSafe;
      
      if (!audio || currentIsWebAudio !== needWebAudio) {
        if (audio) {
          audio.pause();
          audio.remove();
        }
        
        audio = document.createElement("audio");
        audio.id = "playerAudio";
        audio.controls = true;
        audio.style.width = "100%";
        audio.style.height = "32px";
        audio.style.outline = "none";
        audio.style.borderRadius = "4px";
        
        container.appendChild(audio);
        
        // Re-attach event listeners
        audio.addEventListener("timeupdate", debouncedSavePlayerState);
        audio.addEventListener("play", () => {
          if (needWebAudio && audioContext && audioContext.state === "suspended") {
            audioContext.resume();
          }
          savePlayerState();
        });
        audio.addEventListener("pause", savePlayerState);
        audio.addEventListener("volumechange", savePlayerState);
        audio.addEventListener("ended", () => {
          localStorage.removeItem("anicrunch_player_state");
          if (player) player.classList.remove("active");
        });
        
        if (needWebAudio) {
          audio.dataset.webAudio = "true";
          audio.crossOrigin = "anonymous";
          try {
            setupAudioPipeline(audio);
          } catch (e) {
            console.error("Failed to setup Web Audio API pipeline:", e);
          }
        } else {
          audio.dataset.webAudio = "false";
          audio.removeAttribute("crossorigin");
        }
      }
      
      return audio;
    }

    function setupAudioPipeline(audioElement) {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Always create a new MediaElementAudioSourceNode for the recreated audio element
      audioSource = audioContext.createMediaElementSource(audioElement);
      
      // Low Shelf Filter (Bass Enhancer / Highpass filter on mobile)
      eqLowNode = audioContext.createBiquadFilter();
      
      // High Shelf Filter (Treble / Speech presence enhancer)
      eqHighNode = audioContext.createBiquadFilter();
      
      // Dynamic compressor to maximize average volume and punchiness without clipping
      compressorNode = audioContext.createDynamicsCompressor();
      
      // Gain node for clean amplification
      gainNode = audioContext.createGain();
      
      // Connect pipeline
      audioSource.connect(eqLowNode);
      eqLowNode.connect(eqHighNode);
      eqHighNode.connect(compressorNode);
      compressorNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Apply profile
      applyAudioProfile();
    }

    function applyAudioProfile() {
      if (!audioContext || !eqLowNode || !eqHighNode || !compressorNode || !gainNode) return;
      
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // --- MOBILE PRESET ---
        // 1. Cut sub-bass (below 90Hz) to prevent speaker rumble & distortion at high volumes
        eqLowNode.type = "highpass";
        eqLowNode.frequency.value = 90;
        
        // 2. Peaking filter to boost presence/clarity range where vocals and instruments reside
        eqHighNode.type = "peaking";
        eqHighNode.frequency.value = 2500;
        eqHighNode.Q.value = 1.0;
        eqHighNode.gain.value = 3.5; // +3.5dB
        
        // 3. Heavy compression to maximize volume on tiny speakers
        compressorNode.threshold.value = -24;
        compressorNode.knee.value = 30;
        compressorNode.ratio.value = 5.0;
        compressorNode.attack.value = 0.003;
        compressorNode.release.value = 0.25;
        
        // 4. Boost overall gain
        gainNode.gain.value = 1.4; // +40% volume boost
        console.log("🔊 AniCrunch Audio Engine: Applied Mobile Speaker Optimization");
      } else {
        // --- PC / HEADPHONES PRESET ---
        // 1. Warm Bass Boost (below 120Hz)
        eqLowNode.type = "lowshelf";
        eqLowNode.frequency.value = 120;
        eqLowNode.gain.value = 4.0; // +4.0dB bass boost
        
        // 2. High-end presence boost (above 6kHz)
        eqHighNode.type = "highshelf";
        eqHighNode.frequency.value = 6000;
        eqHighNode.gain.value = 2.0; // +2.0dB treble clarity boost
        
        // 3. Light compression for professional studio dynamic smoothing
        compressorNode.threshold.value = -16;
        compressorNode.knee.value = 20;
        compressorNode.ratio.value = 2.5;
        compressorNode.attack.value = 0.005;
        compressorNode.release.value = 0.15;
        
        // 4. Normal gain
        gainNode.gain.value = 1.0;
        console.log("🔊 AniCrunch Audio Engine: Applied PC / Headphone Studio Optimization");
      }
    }

    // Save player state to localStorage
    function savePlayerState() {
      const audio = document.getElementById("playerAudio");
      if (!audio || !audio.src) return;
      const state = {
        url: audio.src,
        title: trackEl ? trackEl.textContent : "",
        anime: animeTitleEl ? animeTitleEl.textContent : "",
        poster: poster ? poster.src : "",
        currentTime: audio.currentTime,
        volume: audio.volume,
        isPlaying: !audio.paused,
        timestamp: Date.now()
      };
      localStorage.setItem("anicrunch_player_state", JSON.stringify(state));
    }

    // Expose persistent controls on window
    window.playLocalSong = function(track) {
      let finalUrl = track.url;
      if (finalUrl.startsWith("/music/")) {
        finalUrl = API_BASE + finalUrl;
      }
      
      const isSafe = isCorsSafe(finalUrl);
      const audio = getAudioElement(isSafe);
      if (!audio) return;
      
      audio.src = finalUrl;
      if (trackEl) trackEl.textContent = track.title;
      if (animeTitleEl) animeTitleEl.textContent = track.anime;

      // Log play count dynamically to backend (Popular/Trending tracking)
      fetch(`${API_BASE}/api/music/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: track.url })
      }).catch(err => console.error("Error logging music play count:", err));
      
      // Load poster
      if (poster) {
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
      }

      // Update HD Badge display and tooltip
      const hdBadge = document.getElementById("hdAudioBadge");
      if (hdBadge) {
        if (isSafe) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          hdBadge.style.display = "inline-block";
          hdBadge.textContent = "HD";
          hdBadge.title = isMobile ? "Audio optimized for Mobile Speakers" : "Audio optimized for PC/Headphones";
        } else {
          hdBadge.style.display = "none";
        }
      }

      if (player) player.classList.add("active");
      audio.play()
        .then(() => savePlayerState())
        .catch(e => {
          console.log("Auto-play prevented by browser policy:", e);
          savePlayerState();
        });
    };

    window.closeMusicPlayer = function() {
      const audio = document.getElementById("playerAudio");
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

    // Restore music playback state
    try {
      const saved = localStorage.getItem("anicrunch_player_state");
      if (saved) {
        const state = JSON.parse(saved);
        if (state.url) {
          const isSafe = isCorsSafe(state.url);
          const restoredAudio = getAudioElement(isSafe);
          if (restoredAudio) {
            restoredAudio.src = state.url;
            if (trackEl) trackEl.textContent = state.title;
            if (animeTitleEl) animeTitleEl.textContent = state.anime;
            if (poster) poster.src = state.poster || "/favicon.png";
            restoredAudio.currentTime = state.currentTime || 0;
            restoredAudio.volume = state.volume !== undefined ? state.volume : 1;
            
            const hdBadge = document.getElementById("hdAudioBadge");
            if (hdBadge) {
              if (isSafe) {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                hdBadge.style.display = "inline-block";
                hdBadge.textContent = "HD";
                hdBadge.title = isMobile ? "Audio optimized for Mobile Speakers" : "Audio optimized for PC/Headphones";
              } else {
                hdBadge.style.display = "none";
              }
            }
            
            if (player) player.classList.add("active");

            if (state.isPlaying) {
              // Attempt to restore play (requires user click or interaction)
              restoredAudio.play().catch(() => {
                state.isPlaying = false;
                localStorage.setItem("anicrunch_player_state", JSON.stringify(state));
              });
            }
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


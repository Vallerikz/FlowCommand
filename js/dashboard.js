// VIMS — Dashboard Controller for ICCC Dark Theme
// Live fleet map, stats cards, alerts feed, incidents table, chart rendering

(function () {
  'use strict';

  // Cross-module accessors for Junction Minimap telemetry
  let getMinimapVehicles = () => [];
  let getMinimapState = () => null;
  let refreshDiffAnalysis = null;

  // Cached bounding rect for junction canvas to eliminate layout thrashing
  let cachedCanvasRect = null;
  function updateCanvasRect() {
    const canvas = document.getElementById('junctionVehicleCanvas');
    if (canvas) {
      cachedCanvasRect = canvas.getBoundingClientRect();
    }
  }

  // ── Hindi Translation Dictionary & Devanagari Numerals Extension ──
  function extendI18nDictionary() {
    if (typeof I18N === 'undefined' || !I18N.DICTIONARY) return;

    if (!I18N.DICTIONARY.en) I18N.DICTIONARY.en = {};
    if (!I18N.DICTIONARY.hi) I18N.DICTIONARY.hi = {};

    Object.assign(I18N.DICTIONARY.en, {
      'sig_green': 'GREEN',
      'sig_amber': 'AMBER',
      'sig_red': 'RED',
      'sig_turn_left': '↰ LEFT ARROW GREEN',
      'sig_turn_right': '↱ RIGHT ARROW GREEN',
      'sig_turn_both': '↰↱ TURN ARROWS GREEN',
      'mode_auto_density': 'AUTO ATSC (DENSITY)',
      'mode_manual_l1_stopped': 'MANUAL: LANE 1 STOPPED',
      'mode_manual_l2_stopped': 'MANUAL: LANE 2 STOPPED',
      'mode_all_red_hold': 'ALL RED HOLD',
      'manual_takeover_active': 'Manual Takeover Active',
      'density_regulated': 'Density Regulated'
    });

    Object.assign(I18N.DICTIONARY.hi, {
      'sig_green': 'हरा',
      'sig_amber': 'पीला',
      'sig_red': 'लाल',
      'sig_turn_left': '↰ बायाँ तीर हरा',
      'sig_turn_right': '↱ दायाँ तीर हरा',
      'sig_turn_both': '↰↱ मोड़ तीर हरे',
      'mode_auto_density': 'ऑटो एटीएससी (घनत्व)',
      'mode_manual_l1_stopped': 'मैनुअल: लेन १ रोकी गई',
      'mode_manual_l2_stopped': 'मैनुअल: लेन २ रोकी गई',
      'mode_all_red_hold': 'सभी लाल रोकें',
      'manual_takeover_active': 'मैनुअल नियंत्रण सक्रिय',
      'density_regulated': 'घनत्व नियंत्रित',
      'map_title': 'एकल जंक्शन मिनीमैप (२ लंबवत लेन)',
      'junction_node': 'जंक्शन-०१ केंद्रीय',
      'btn_force_lane_1': 'लेन १ प्रवाह (लेन २ रोकें)',
      'btn_force_lane_2': 'लेन २ प्रवाह (लेन १ रोकें)',
      'lane_1_label': 'लेन १: उत्तर-दक्षिण',
      'lane_2_label': 'लेन २: पूर्व-पश्चिम'
    });
  }

  // ── Runtime ATSC Telemetry Digit Localization Hook ──
  function hookAtscTelemetryLocalization() {
    if (typeof COMMAND === 'undefined' || typeof COMMAND._atscRender !== 'function' || COMMAND._atscHooked) return;
    COMMAND._atscHooked = true;
    const origAtscRender = COMMAND._atscRender.bind(COMMAND);

    COMMAND._atscRender = function (d) {
      COMMAND._lastAtscData = d;
      origAtscRender(d);

      if (typeof I18N !== 'undefined') {
        const isHi = I18N.CURRENT_LANG === 'hi';
        const toDigits = (v) => (typeof I18N.toLocalizedDigits === 'function' ? I18N.toLocalizedDigits(v) : v);

        const phaseEl = document.getElementById('atscPhaseStatus');
        const elapsedEl = document.getElementById('atscElapsedTime');
        const minGreenEl = document.getElementById('atscMinGreenRemain');
        const cycleEl = document.getElementById('atscCycleCount');
        const nsValEl = document.getElementById('atscNsPcuVal');
        const ewValEl = document.getElementById('atscEwPcuVal');

        if (phaseEl && isHi && d) {
          const activeCorridor = (d.active_corridor || '').toUpperCase();
          const lightState = (d.light_state || '').toUpperCase();
          const corridorLabel = activeCorridor === 'NS' ? 'उत्तर–दक्षिण' : 'पूर्व–पश्चिम';
          if (lightState === 'GREEN') {
            phaseEl.textContent = `${corridorLabel} कॉरिडोर — हरा`;
          } else if (lightState === 'AMBER') {
            phaseEl.textContent = `${corridorLabel} कॉरिडोर — खाली हो रहा है`;
          } else if (lightState === 'ALL_RED') {
            phaseEl.textContent = 'सभी लाल — निकासी अंतराल';
          }
        }

        if (elapsedEl && elapsedEl.textContent) {
          elapsedEl.textContent = toDigits(elapsedEl.textContent);
        }
        if (minGreenEl && minGreenEl.textContent) {
          minGreenEl.textContent = toDigits(minGreenEl.textContent);
        }
        if (cycleEl && cycleEl.textContent) {
          cycleEl.textContent = toDigits(cycleEl.textContent);
        }
        if (nsValEl && nsValEl.textContent) {
          nsValEl.textContent = toDigits(nsValEl.textContent);
        }
        if (ewValEl && ewValEl.textContent) {
          ewValEl.textContent = toDigits(ewValEl.textContent);
        }
      }
    };

    window.addEventListener('vims-lang-changed', () => {
      if (COMMAND._lastAtscData) {
        COMMAND._atscRender(COMMAND._lastAtscData);
      }
    });
  }

  // Extend dictionary and hook ATSC immediately
  extendI18nDictionary();
  hookAtscTelemetryLocalization();

 // Wait for DOM
  document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
  });

  function initDashboard() {
    extendI18nDictionary();
    hookAtscTelemetryLocalization();

    // Auth guard (command.js also handles this, but be safe)
    if (typeof AUTH !== 'undefined' && typeof AUTH.requireLaw === 'function') {
      const session = AUTH.requireLaw();
      if (!session) return;
    }

    // Init i18n
    if (typeof I18N !== 'undefined') {
      I18N.init();
      if (typeof I18N.apply === 'function') {
        I18N.apply();
      }
    }

    initClock();
    initNavigation();
    initJunctionMinimap();
    initLangToggle();
    initThemeToggle();
    startLiveUpdates();

    // Controllers for the command tabs
    initFleetOverview();
    initIncidentLogs();
    initRouteMgmt();
    initAssetDatabase();
    initStaffRoster();
    initSystemLogs();
    initDiffAnalysis();
  }

 // IST Clock
  function initClock() {
    const clockEl = document.getElementById('istClock');
    function update() {
      const now = new Date();
      const options = {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      };
      const timeStr = new Intl.DateTimeFormat('en-US', options).format(now);
      const dateOptions = {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric'
      };
      const dateStr = new Intl.DateTimeFormat('en-GB', dateOptions).format(now).toUpperCase();
      let formattedClock = `${timeStr} | ${dateStr}`;
      if (typeof I18N !== 'undefined' && typeof I18N.toLocalizedDigits === 'function') {
        formattedClock = I18N.toLocalizedDigits(formattedClock);
      }
      if (clockEl) clockEl.textContent = formattedClock;
    }
    update();
    setInterval(update, 1000);
    window.addEventListener('vims-lang-changed', update);
  }

 // Language Toggle
  function initLangToggle() {
    if (typeof I18N !== 'undefined' && typeof I18N.bindToggleButton === 'function') {
      I18N.bindToggleButton();
    }
  }

 // Theme Toggle
  function initThemeToggle() {
    const themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return;

    const themes = [
      { id: 'oled', label: 'THEME: OLED TRUE BLACK', dataTheme: '' },
      { id: 'navy', label: 'THEME: ROYAL NAVY', dataTheme: 'navy' },
      { id: 'emerald', label: 'THEME: SMART EMERALD', dataTheme: 'emerald' },
      { id: 'crimson', label: 'THEME: CRIMSON TACTICAL', dataTheme: 'crimson' }
    ];

    let currentIdx = 0;
    const savedTheme = localStorage.getItem('vims_theme') || 'oled';
    const foundIdx = themes.findIndex(t => t.id === savedTheme);
    if (foundIdx >= 0) currentIdx = foundIdx;

    function applyTheme(idx) {
      const t = themes[idx];
      if (t.dataTheme) {
        document.documentElement.setAttribute('data-theme', t.dataTheme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      themeBtn.textContent = t.label;
      localStorage.setItem('vims_theme', t.id);
    }

    applyTheme(currentIdx);

    themeBtn.addEventListener('click', () => {
      currentIdx = (currentIdx + 1) % themes.length;
      applyTheme(currentIdx);
    });
  }

 // Navigation (Top Nav + Sidebar)
  function initNavigation() {
    // Top nav links
    document.querySelectorAll('.topnav-link[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.getAttribute('data-view');
        showView(viewId);
      });
    });

    // Sidebar links
    document.querySelectorAll('.sidebar-link[data-view]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = link.getAttribute('data-view');
        showView(viewId);
      });
    });

    // Sign out
    const signOut = document.getElementById('sidebarSignOut');
    if (signOut) {
      signOut.addEventListener('click', () => {
        if (typeof AUTH !== 'undefined') {
          AUTH.logout();
        } else {
          window.location.href = 'index.html';
        }
      });
    }
  }

  function showView(viewId) {
    if (viewId === 'fleet-map') {
      viewId = 'command-centre';
      const mapCard = document.querySelector('.junction-minimap-card');
      if (mapCard) setTimeout(() => mapCard.scrollIntoView({ behavior: 'smooth' }), 50);
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    // Sync active state across both top nav and sidebar
    document.querySelectorAll('.topnav-link').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-view') === viewId);
    });
    document.querySelectorAll('.sidebar-link').forEach(s => {
      s.classList.toggle('active', s.getAttribute('data-view') === viewId);
    });

    // Scroll terminal down when switching to system logs
    if (viewId === 'system-logs') {
      const term = document.getElementById('systemLogTerminal');
      if (term) setTimeout(() => { term.scrollTop = term.scrollHeight; }, 50);
    }

    // Refresh diff analysis immediately when switching to diff-analysis
    if (viewId === 'diff-analysis' && typeof refreshDiffAnalysis === 'function') {
      refreshDiffAnalysis();
    }

    // Refresh canvas rect cache when returning to command centre
    if (viewId === 'command-centre') {
      setTimeout(updateCanvasRect, 50);
    }
  }

 // Single Junction Minimap Controller (2 Perpendicular Lanes)
  function initJunctionMinimap() {
    const canvas = document.getElementById('junctionVehicleCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cache initial canvas bounding rect and listen for geometry changes
    updateCanvasRect();
    window.addEventListener('resize', updateCanvasRect);
    window.addEventListener('scroll', updateCanvasRect, { passive: true });
    canvas.addEventListener('mouseenter', updateCanvasRect);

    // Internal Junction State
    const state = {
      currentCameraId: 'CAM-01',
      currentLayout: null,
      activeCorridor: 'NS', // 'NS' (Lane 1) or 'EW' (Lane 2)
      lightState: 'RED',    // Red circular lens during leading protected turn arrow phase
      arrowL: 'GREEN',      // Leading Left Turn Arrow FIRST!
      arrowR: 'OFF',
      subPhase: 'TURN_LEFT_ARROW', // Leading phase order: Turn Arrows FIRST -> Through GREEN second
      timeInPhase: 0,
      cycleCount: 1,
      regulationMode: 'ADAPTIVE', // 'ADAPTIVE', 'MANUAL_STOP_L1', 'MANUAL_STOP_L2', 'ALL_RED'
      pcu: { NS: 16.0, EW: 12.0 },
      totals: { NS: 4, EW: 4 },
      queues: { NS: 0, EW: 0 },
      densityMultiplier: 1.0,
      lastTick: Date.now()
    };

    // DOM Elements
    const el = {
      // Signals
      lensNR: document.getElementById('sigLensN_R'),
      lensNA: document.getElementById('sigLensN_A'),
      lensNG: document.getElementById('sigLensN_G'),
      lensNArrowL: document.getElementById('sigLensN_ArrowL'),
      lensNArrowR: document.getElementById('sigLensN_ArrowR'),
      lensSR: document.getElementById('sigLensS_R'),
      lensSA: document.getElementById('sigLensS_A'),
      lensSG: document.getElementById('sigLensS_G'),
      lensSArrowL: document.getElementById('sigLensS_ArrowL'),
      lensSArrowR: document.getElementById('sigLensS_ArrowR'),
      lensWR: document.getElementById('sigLensW_R'),
      lensWA: document.getElementById('sigLensW_A'),
      lensWG: document.getElementById('sigLensW_G'),
      lensWArrowL: document.getElementById('sigLensW_ArrowL'),
      lensWArrowR: document.getElementById('sigLensW_ArrowR'),
      lensER: document.getElementById('sigLensE_R'),
      lensEA: document.getElementById('sigLensE_A'),
      lensEG: document.getElementById('sigLensE_G'),
      lensEArrowL: document.getElementById('sigLensE_ArrowL'),
      lensEArrowR: document.getElementById('sigLensE_ArrowR'),

      // Lane 1 HUD
      hudL1Badge: document.getElementById('hudLane1SignalBadge'),
      hudL1Pcu: document.getElementById('hudLane1Pcu'),
      hudL1Veh: document.getElementById('hudLane1Veh'),
      hudL1Queue: document.getElementById('hudLane1Queue'),
      hudL1Bar: document.getElementById('hudLane1PcuBar'),
      btnStopL1: document.getElementById('btnToggleStopL1'),

      // Lane 2 HUD
      hudL2Badge: document.getElementById('hudLane2SignalBadge'),
      hudL2Pcu: document.getElementById('hudLane2Pcu'),
      hudL2Veh: document.getElementById('hudLane2Veh'),
      hudL2Queue: document.getElementById('hudLane2Queue'),
      hudL2Bar: document.getElementById('hudLane2PcuBar'),
      btnStopL2: document.getElementById('btnToggleStopL2'),

      // Telemetry
      hudPhaseTimer: document.getElementById('hudPhaseTimer'),
      hudMinGreenTimer: document.getElementById('hudMinGreenTimer'),
      hudCycleCount: document.getElementById('hudCycleCount'),
      modeBadge: document.getElementById('junctionModeBadge'),

      // Override buttons
      btnAuto: document.getElementById('btnJunctionAuto'),
      btnForceL1: document.getElementById('btnJunctionForceL1'),
      btnForceL2: document.getElementById('btnJunctionForceL2'),
      btnAllRed: document.getElementById('btnJunctionAllRed'),

      // Canvas controls
      btnDensityUp: document.getElementById('btnJuncDensityUp'),
      btnDensityDown: document.getElementById('btnJuncDensityDown'),
      btnCenter: document.getElementById('btnJuncCenter')
    };

    // ── CORRIDOR CAMERA JUNCTION CUT SCHEMATICS (CAM-01 to CAM-06) ──
    const COMMON_SVG_DEFS = `
      <defs>
        <linearGradient id="roadAsphaltV" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0a0a0c"/>
          <stop offset="50%" stop-color="#141418"/>
          <stop offset="100%" stop-color="#0a0a0c"/>
        </linearGradient>
        <linearGradient id="roadAsphaltH" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0a0a0c"/>
          <stop offset="50%" stop-color="#141418"/>
          <stop offset="100%" stop-color="#0a0a0c"/>
        </linearGradient>
        <linearGradient id="roadAsphaltDiag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0a0a0c"/>
          <stop offset="50%" stop-color="#141418"/>
          <stop offset="100%" stop-color="#0a0a0c"/>
        </linearGradient>
        <linearGradient id="riverWaterFlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#042f2e"/>
          <stop offset="50%" stop-color="#0e7490"/>
          <stop offset="100%" stop-color="#042f2e"/>
        </linearGradient>
        <pattern id="junctionBoxHatch" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="16" stroke="rgba(245, 158, 11, 0.2)" stroke-width="1.5" />
        </pattern>
      </defs>
    `;

    function getSignalHeadsSvg(posN, posS, posW, posE) {
      return `
        <!-- North Signal (governs Lane 1 Southbound) -->
        <g id="sigHeadN" transform="translate(${posN.x}, ${posN.y})">
          <rect x="0" y="0" width="22" height="54" rx="4" fill="#09090b" stroke="#27272a" stroke-width="1"/>
          <circle id="sigLensN_R" cx="11" cy="11" r="5" class="signal-lens red active-red"/>
          <circle id="sigLensN_A" cx="11" cy="24" r="5" class="signal-lens amber"/>
          <circle id="sigLensN_G" cx="11" cy="37" r="5" class="signal-lens green"/>
          <path id="sigLensN_ArrowL" class="turn-arrow" d="M 14 47 L 8 47 M 8 47 L 11 44 M 8 47 L 11 50" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path id="sigLensN_ArrowR" class="turn-arrow" d="M 8 47 L 14 47 M 14 47 L 11 44 M 14 47 L 11 50" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <!-- South Signal (governs Lane 1 Northbound) -->
        <g id="sigHeadS" transform="translate(${posS.x}, ${posS.y})">
          <rect x="0" y="0" width="22" height="54" rx="4" fill="#09090b" stroke="#27272a" stroke-width="1"/>
          <circle id="sigLensS_R" cx="11" cy="11" r="5" class="signal-lens red active-red"/>
          <circle id="sigLensS_A" cx="11" cy="24" r="5" class="signal-lens amber"/>
          <circle id="sigLensS_G" cx="11" cy="37" r="5" class="signal-lens green"/>
          <path id="sigLensS_ArrowL" class="turn-arrow" d="M 14 47 L 8 47 M 8 47 L 11 44 M 8 47 L 11 50" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path id="sigLensS_ArrowR" class="turn-arrow" d="M 8 47 L 14 47 M 14 47 L 11 44 M 14 47 L 11 50" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <!-- West Signal (governs Lane 2 Eastbound) -->
        <g id="sigHeadW" transform="translate(${posW.x}, ${posW.y})">
          <rect x="0" y="0" width="54" height="22" rx="4" fill="#09090b" stroke="#27272a" stroke-width="1"/>
          <circle id="sigLensW_R" cx="11" cy="11" r="5" class="signal-lens red active-red"/>
          <circle id="sigLensW_A" cx="24" cy="11" r="5" class="signal-lens amber"/>
          <circle id="sigLensW_G" cx="37" cy="11" r="5" class="signal-lens green"/>
          <path id="sigLensW_ArrowL" class="turn-arrow" d="M 47 14 L 47 8 M 47 8 L 44 11 M 47 8 L 50 11" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path id="sigLensW_ArrowR" class="turn-arrow" d="M 47 8 L 47 14 M 47 14 L 44 11 M 47 14 L 50 11" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <!-- East Signal (governs Lane 2 Westbound) -->
        <g id="sigHeadE" transform="translate(${posE.x}, ${posE.y})">
          <rect x="0" y="0" width="54" height="22" rx="4" fill="#09090b" stroke="#27272a" stroke-width="1"/>
          <circle id="sigLensE_R" cx="11" cy="11" r="5" class="signal-lens red active-red"/>
          <circle id="sigLensE_A" cx="24" cy="11" r="5" class="signal-lens amber"/>
          <circle id="sigLensE_G" cx="37" cy="11" r="5" class="signal-lens green"/>
          <path id="sigLensE_ArrowL" class="turn-arrow" d="M 47 14 L 47 8 M 47 8 L 44 11 M 47 8 L 50 11" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path id="sigLensE_ArrowR" class="turn-arrow" d="M 47 8 L 47 14 M 47 14 L 44 11 M 47 14 L 50 11" stroke="#3f3f46" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      `;
    }

    const JUNCTION_LAYOUTS = {
      'CAM-01': {
        id: 'CAM-01',
        title: 'Swargate Chowk Minimap (NH-60 x Tilak Rd)',
        badge: 'CAM-01 • 65° SKEWED DIAGONAL CUT',
        lane1: 'Shivaji Road / NH-60 (North-South)',
        lane2: 'Tilak Road / Shankarsheth (East-West Skewed 65°)',
        type: 'skewed_65',
        stopLines: { N: 120, S: 218, W: 346, E: 452 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 114, yMax: 226 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <polygon points="0,0 352,0 352,130 0,190" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,0 800,0 800,54 448,114" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="0,286 352,226 352,340 0,340" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,210 800,150 800,340 448,340" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Lane 1 (NS Vertical Corridor) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <line x1="352" y1="0" x2="352" y2="130" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="352" y1="226" x2="352" y2="340" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="0" x2="448" y2="114" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="210" x2="448" y2="340" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="400" y1="0" x2="400" y2="118" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="222" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="120" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="116" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="224" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="220" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2: 65° Skewed Diagonal Road -->
              <polygon points="0,190 800,54 800,150 0,286" fill="url(#roadAsphaltDiag)"/>
              <line x1="0" y1="190" x2="352" y2="130" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="114" x2="800" y2="54" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="286" x2="352" y2="226" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="210" x2="800" y2="150" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="0" y1="238" x2="335" y2="181" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="159" x2="800" y2="102" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="214" x2="335" y2="157" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="135" x2="800" y2="78" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="262" x2="335" y2="205" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="183" x2="800" y2="126" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Center Intersection Parallelogram Box -->
              <polygon points="352,130 448,114 448,210 352,226" fill="#0d0d10"/>
              <polygon points="352,130 448,114 448,210 352,226" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Angled Zebra Crosswalks -->
              <g stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="butt">
                <line x1="356" y1="116" x2="444" y2="101" stroke-dasharray="6 6"/>
                <line x1="356" y1="122" x2="444" y2="107" stroke-dasharray="6 6"/>
                <line x1="356" y1="234" x2="444" y2="219" stroke-dasharray="6 6"/>
                <line x1="356" y1="240" x2="444" y2="225" stroke-dasharray="6 6"/>
                <line x1="338" y1="135" x2="338" y2="231" stroke-dasharray="6 6"/>
                <line x1="344" y1="134" x2="344" y2="230" stroke-dasharray="6 6"/>
                <line x1="456" y1="110" x2="456" y2="206" stroke-dasharray="6 6"/>
                <line x1="462" y1="109" x2="462" y2="205" stroke-dasharray="6 6"/>
              </g>

              <!-- Stop Lines -->
              <line x1="352" y1="124" x2="400" y2="116" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="222" x2="448" y2="214" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="346" y1="180" x2="346" y2="228" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="452" y1="112" x2="452" y2="160" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 326, y: 64 }, { x: 454, y: 232 }, { x: 292, y: 248 }, { x: 468, y: 80 })}
            </svg>
          `;
        }
      },

      'CAM-02': {
        id: 'CAM-02',
        title: 'Alka Talkies Chowk Minimap (Sambhaji Bridge Splay)',
        badge: 'CAM-02 • Y-FORK SPLAY & CHEVRON ISLAND',
        lane1: 'Tilak Rd / Sambhaji Bridge Connector (NS)',
        lane2: 'Kumthekar & Kelkar Roads (EW Fork)',
        type: 'y_fork',
        stopLines: { N: 120, S: 220, W: 348, E: 450 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 108, yMax: 230 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <polygon points="0,0 352,0 352,122 0,122" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,0 800,0 800,122 448,122" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="0,300 352,218 352,340 0,340" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,218 800,218 800,340 448,340" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Median separator between Kumthekar and Kelkar at far west -->
              <polygon points="0,170 60,170 60,220 0,230" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Lane 1 (NS Road) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <line x1="352" y1="0" x2="352" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="352" y1="218" x2="352" y2="340" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="0" x2="448" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="218" x2="448" y2="340" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="400" y1="0" x2="400" y2="105" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="235" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="235" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="235" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 East (Horizontal Road) -->
              <rect x="448" y="122" width="352" height="96" fill="url(#roadAsphaltH)"/>
              <line x1="448" y1="122" x2="800" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="218" x2="800" y2="218" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="465" y1="170" x2="800" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="146" x2="800" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="194" x2="800" y2="194" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 West: Kumthekar Road (Upper Branch, Westbound Exit) -->
              <rect x="0" y="122" width="352" height="48" fill="url(#roadAsphaltH)"/>
              <line x1="0" y1="122" x2="352" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="170" x2="352" y2="170" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="146" x2="335" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 West: Kelkar Road (Lower Splay Branch, Eastbound Entrance) -->
              <polygon points="0,230 348,170 352,170 352,218 0,300" fill="url(#roadAsphaltDiag)"/>
              <line x1="0" y1="230" x2="348" y2="170" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="300" x2="352" y2="218" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="265" x2="335" y2="194" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="248" x2="335" y2="182" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="282" x2="335" y2="206" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Chevron Gore Island (Gore Area Dividing Kumthekar & Kelkar Roads) -->
              <polygon points="60,170 348,170 60,220" fill="#18181b" stroke="#eab308" stroke-width="2"/>
              <line x1="100" y1="172" x2="85" y2="214" stroke="#f59e0b" stroke-width="2.2"/>
              <line x1="145" y1="172" x2="130" y2="206" stroke="#f59e0b" stroke-width="2.2"/>
              <line x1="190" y1="172" x2="175" y2="199" stroke="#f59e0b" stroke-width="2.2"/>
              <line x1="235" y1="172" x2="220" y2="191" stroke="#f59e0b" stroke-width="2.2"/>
              <line x1="280" y1="172" x2="265" y2="183" stroke="#f59e0b" stroke-width="2.2"/>
              <line x1="325" y1="172" x2="310" y2="176" stroke="#f59e0b" stroke-width="2.2"/>
              <circle cx="344" cy="171" r="3" fill="#facc15" stroke="#78350f" stroke-width="1"/>
              <circle cx="310" cy="174" r="3" fill="#facc15" stroke="#78350f" stroke-width="1"/>
              <circle cx="265" cy="181" r="3.5" fill="#facc15" stroke="#78350f" stroke-width="1"/>
              <circle cx="215" cy="190" r="3.5" fill="#facc15" stroke="#78350f" stroke-width="1"/>
              <circle cx="160" cy="200" r="3.5" fill="#facc15" stroke="#78350f" stroke-width="1"/>
              <circle cx="100" cy="210" r="3.5" fill="#facc15" stroke="#78350f" stroke-width="1"/>

              <!-- Center Intersection Box -->
              <rect x="352" y="122" width="96" height="96" fill="#0d0d10"/>
              <rect x="352" y="122" width="96" height="96" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Crosswalks -->
              <g stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="butt">
                <line x1="356" y1="108" x2="444" y2="108" stroke-dasharray="6 6"/>
                <line x1="356" y1="114" x2="444" y2="114" stroke-dasharray="6 6"/>
                <line x1="356" y1="226" x2="444" y2="226" stroke-dasharray="6 6"/>
                <line x1="356" y1="232" x2="444" y2="232" stroke-dasharray="6 6"/>
                <line x1="338" y1="126" x2="338" y2="214" stroke-dasharray="6 6"/>
                <line x1="344" y1="126" x2="344" y2="214" stroke-dasharray="6 6"/>
                <line x1="456" y1="126" x2="456" y2="214" stroke-dasharray="6 6"/>
                <line x1="462" y1="126" x2="462" y2="214" stroke-dasharray="6 6"/>
              </g>

              <!-- Stop Lines -->
              <line x1="352" y1="120" x2="400" y2="120" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="220" x2="448" y2="220" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="348" y1="170" x2="348" y2="218" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="450" y1="122" x2="450" y2="170" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 326, y: 68 }, { x: 454, y: 230 }, { x: 310, y: 236 }, { x: 466, y: 96 })}
            </svg>
          `;
        }
      },

      'CAM-03': {
        id: 'CAM-03',
        title: 'Balgandharva Chowk Minimap (JM Road Arterial)',
        badge: 'CAM-03 • 90° ORTHOGONAL SQUARE CUT',
        lane1: 'Jangali Maharaj Path (North-South)',
        lane2: 'J.M. Road 6-Lane Arterial (East-West)',
        type: 'square_90',
        stopLines: { N: 120, S: 220, W: 350, E: 450 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 108, yMax: 230 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <rect x="0" y="0" width="352" height="122" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <rect x="448" y="0" width="352" height="122" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <rect x="0" y="218" width="352" height="122" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <rect x="448" y="218" width="352" height="122" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Lane 1 (NS Road) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <line x1="352" y1="0" x2="352" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="352" y1="218" x2="352" y2="340" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="0" x2="448" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="218" x2="448" y2="340" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="400" y1="0" x2="400" y2="105" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="235" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="235" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="235" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 (EW Road) -->
              <rect x="0" y="122" width="800" height="96" fill="url(#roadAsphaltH)"/>
              <line x1="0" y1="122" x2="352" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="122" x2="800" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="218" x2="352" y2="218" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="218" x2="800" y2="218" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="0" y1="170" x2="335" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="170" x2="800" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="146" x2="335" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="194" x2="335" y2="194" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="146" x2="800" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="194" x2="800" y2="194" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Center Junction Box -->
              <rect x="352" y="122" width="96" height="96" fill="#0d0d10"/>
              <rect x="352" y="122" width="96" height="96" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Crosswalks -->
              <g stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="butt">
                <line x1="356" y1="108" x2="444" y2="108" stroke-dasharray="6 6"/>
                <line x1="356" y1="114" x2="444" y2="114" stroke-dasharray="6 6"/>
                <line x1="356" y1="226" x2="444" y2="226" stroke-dasharray="6 6"/>
                <line x1="356" y1="232" x2="444" y2="232" stroke-dasharray="6 6"/>
                <line x1="338" y1="126" x2="338" y2="214" stroke-dasharray="6 6"/>
                <line x1="344" y1="126" x2="344" y2="214" stroke-dasharray="6 6"/>
                <line x1="456" y1="126" x2="456" y2="214" stroke-dasharray="6 6"/>
                <line x1="462" y1="126" x2="462" y2="214" stroke-dasharray="6 6"/>
              </g>

              <!-- Stop Lines -->
              <line x1="352" y1="120" x2="400" y2="120" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="220" x2="448" y2="220" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="350" y1="170" x2="350" y2="218" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="450" y1="122" x2="450" y2="170" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 328, y: 68 }, { x: 454, y: 230 }, { x: 296, y: 226 }, { x: 466, y: 96 })}
            </svg>
          `;
        }
      },

      'CAM-04': {
        id: 'CAM-04',
        title: 'Goodluck Cafe Chowk Minimap (FC Road Dogleg)',
        badge: 'CAM-04 • OFFSET STAGGERED DOGLEG CUT',
        lane1: 'Fergusson College Road (North-South)',
        lane2: 'Deccan Gymkhana Approach (Staggered EW)',
        type: 'offset_staggered',
        stopLines: { N: 84, S: 256, W: 346, E: 454 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 78, yMax: 262 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <polygon points="0,0 352,0 352,88 0,88" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,0 800,0 800,156 448,156" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="0,184 352,184 352,340 0,340" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,252 800,252 800,340 448,340" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Lane 1 (FC Road NS) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <line x1="352" y1="0" x2="352" y2="88" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="352" y1="184" x2="352" y2="340" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="0" x2="448" y2="156" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="252" x2="448" y2="340" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="400" y1="0" x2="400" y2="78" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="262" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="78" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="78" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="262" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="262" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- West Approach (Higher: y=88..184) -->
              <rect x="0" y="88" width="352" height="96" fill="url(#roadAsphaltH)"/>
              <line x1="0" y1="88" x2="352" y2="88" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="184" x2="352" y2="184" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="136" x2="335" y2="136" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="112" x2="335" y2="112" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="160" x2="335" y2="160" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- East Approach (Lower: y=156..252) -->
              <rect x="448" y="156" width="352" height="96" fill="url(#roadAsphaltH)"/>
              <line x1="448" y1="156" x2="800" y2="156" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="252" x2="800" y2="252" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="465" y1="204" x2="800" y2="204" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="180" x2="800" y2="180" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="228" x2="800" y2="228" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Center Junction Staggered Dogleg Box -->
              <polygon points="352,88 448,156 448,252 352,184" fill="#0d0d10"/>
              <polygon points="352,88 448,156 448,252 352,184" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Crosswalks -->
              <g stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="butt">
                <line x1="356" y1="74" x2="444" y2="74" stroke-dasharray="6 6"/>
                <line x1="356" y1="80" x2="444" y2="80" stroke-dasharray="6 6"/>
                <line x1="356" y1="260" x2="444" y2="260" stroke-dasharray="6 6"/>
                <line x1="356" y1="266" x2="444" y2="266" stroke-dasharray="6 6"/>
                <line x1="338" y1="92" x2="338" y2="180" stroke-dasharray="6 6"/>
                <line x1="344" y1="92" x2="344" y2="180" stroke-dasharray="6 6"/>
                <line x1="456" y1="160" x2="456" y2="248" stroke-dasharray="6 6"/>
                <line x1="462" y1="160" x2="462" y2="248" stroke-dasharray="6 6"/>
              </g>

              <!-- Stop Lines -->
              <line x1="352" y1="84" x2="400" y2="84" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="256" x2="448" y2="256" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="346" y1="136" x2="346" y2="184" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="454" y1="156" x2="454" y2="204" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 326, y: 34 }, { x: 454, y: 262 }, { x: 292, y: 192 }, { x: 468, y: 130 })}
            </svg>
          `;
        }
      },

      'CAM-05': {
        id: 'CAM-05',
        title: 'Deccan Gymkhana Chowk Minimap (Karve Rd Hub)',
        badge: 'CAM-05 • 75° OBLIQUE ARTERIAL & ROUNDED CURBS',
        lane1: 'Prabhat Road Corridor (North-South)',
        lane2: 'Karve Road Commercial Arterial (Oblique EW)',
        type: 'oblique_75',
        stopLines: { N: 114, S: 226, W: 346, E: 454 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 110, yMax: 232 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <polygon points="0,0 352,0 352,117 0,145" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,0 800,0 800,102 448,109" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="0,270 352,269 352,340 0,340" fill="#000000" stroke="#18181b" stroke-width="1"/>
              <polygon points="448,231 800,198 800,340 448,340" fill="#000000" stroke="#18181b" stroke-width="1"/>

              <!-- Lane 1 (NS Road) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <line x1="400" y1="0" x2="400" y2="110" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="230" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="110" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="110" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="230" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="230" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 (75° Oblique Arterial Road) -->
              <polygon points="0,174 800,102 800,198 0,270" fill="url(#roadAsphaltDiag)"/>
              <line x1="0" y1="222" x2="335" y2="192" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="180" x2="800" y2="150" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="198" x2="335" y2="168" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="156" x2="800" y2="126" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="246" x2="335" y2="216" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="204" x2="800" y2="174" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Large Rounded Corner Fillet Curbs (r=28) -->
              <path d="M 0 174 L 324 145 A 28 28 0 0 1 352 117 L 352 0" stroke="#3f3f46" stroke-width="2" fill="none"/>
              <path d="M 448 0 L 448 109 A 28 28 0 0 0 476 137 L 800 102" stroke="#3f3f46" stroke-width="2" fill="none"/>
              <path d="M 0 270 L 324 241 A 28 28 0 0 0 352 269 L 352 340" stroke="#3f3f46" stroke-width="2" fill="none"/>
              <path d="M 448 340 L 448 231 A 28 28 0 0 1 476 203 L 800 198" stroke="#3f3f46" stroke-width="2" fill="none"/>

              <!-- Oblique Center Box -->
              <polygon points="352,126 448,118 448,214 352,222" fill="#0d0d10"/>
              <polygon points="352,126 448,118 448,214 352,222" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Stop Lines -->
              <line x1="352" y1="116" x2="400" y2="112" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="228" x2="448" y2="224" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="346" y1="192" x2="346" y2="240" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="454" y1="126" x2="454" y2="174" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 324, y: 64 }, { x: 456, y: 236 }, { x: 292, y: 238 }, { x: 468, y: 88 })}
            </svg>
          `;
        }
      },

      'CAM-06': {
        id: 'CAM-06',
        title: 'Sambhaji Bridge Minimap (Lakdi Pul Over Mutha)',
        badge: 'CAM-06 • MUTHA RIVER BRIDGE CROSSING CUT',
        lane1: 'Sambhaji Bridge Deck (North-South)',
        lane2: 'Kelkar Riverside Road (East-West Riverbank)',
        type: 'river_bridge',
        stopLines: { N: 120, S: 220, W: 350, E: 450 },
        junctionZone: { xMin: 340, xMax: 460, yMin: 108, yMax: 230 },
        getSvg: function () {
          return `
            <svg id="junctionSvg" viewBox="0 0 800 340" preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg">
              ${COMMON_SVG_DEFS}
              <!-- Mutha River Water (North & South Quadrants) -->
              <rect x="0" y="0" width="348" height="118" fill="url(#riverWaterFlow)"/>
              <rect x="452" y="0" width="348" height="118" fill="url(#riverWaterFlow)"/>
              <rect x="0" y="222" width="348" height="118" fill="url(#riverWaterFlow)"/>
              <rect x="452" y="222" width="348" height="118" fill="url(#riverWaterFlow)"/>

              <!-- Flowing River Water Wavelines -->
              <path d="M 20 35 Q 60 25, 100 35 T 180 35 T 260 35 T 340 35" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.8" fill="none"/>
              <path d="M 40 75 Q 80 65, 120 75 T 200 75 T 280 75" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1.8" fill="none"/>
              <path d="M 460 35 Q 500 25, 540 35 T 620 35 T 700 35 T 780 35" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.8" fill="none"/>
              <path d="M 480 75 Q 520 65, 560 75 T 640 75 T 720 75" stroke="rgba(56, 189, 248, 0.3)" stroke-width="1.8" fill="none"/>
              <path d="M 20 260 Q 60 250, 100 260 T 180 260 T 260 260 T 340 260" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.8" fill="none"/>
              <path d="M 460 260 Q 500 250, 540 260 T 620 260 T 700 260 T 780 260" stroke="rgba(56, 189, 248, 0.4)" stroke-width="1.8" fill="none"/>

              <!-- River Embankment Stone Walls -->
              <rect x="0" y="118" width="348" height="4" fill="#64748b" stroke="#334155"/>
              <rect x="452" y="118" width="348" height="4" fill="#64748b" stroke="#334155"/>
              <rect x="0" y="218" width="348" height="4" fill="#64748b" stroke="#334155"/>
              <rect x="452" y="218" width="348" height="4" fill="#64748b" stroke="#334155"/>

              <!-- Stone Bridge Deck (Lane 1 NS) -->
              <rect x="352" y="0" width="96" height="340" fill="url(#roadAsphaltV)"/>
              <rect x="346" y="0" width="6" height="118" fill="#475569" stroke="#1e293b"/>
              <rect x="448" y="0" width="6" height="118" fill="#475569" stroke="#1e293b"/>
              <rect x="344" y="0" width="8" height="6" fill="#94a3b8"/><rect x="344" y="30" width="8" height="6" fill="#94a3b8"/><rect x="344" y="60" width="8" height="6" fill="#94a3b8"/><rect x="344" y="90" width="8" height="6" fill="#94a3b8"/>
              <rect x="448" y="0" width="8" height="6" fill="#94a3b8"/><rect x="448" y="30" width="8" height="6" fill="#94a3b8"/><rect x="448" y="60" width="8" height="6" fill="#94a3b8"/><rect x="448" y="90" width="8" height="6" fill="#94a3b8"/>

              <rect x="346" y="222" width="6" height="118" fill="#475569" stroke="#1e293b"/>
              <rect x="448" y="222" width="6" height="118" fill="#475569" stroke="#1e293b"/>
              <rect x="344" y="222" width="8" height="6" fill="#94a3b8"/><rect x="344" y="252" width="8" height="6" fill="#94a3b8"/><rect x="344" y="282" width="8" height="6" fill="#94a3b8"/><rect x="344" y="312" width="8" height="6" fill="#94a3b8"/>
              <rect x="448" y="222" width="8" height="6" fill="#94a3b8"/><rect x="448" y="252" width="8" height="6" fill="#94a3b8"/><rect x="448" y="282" width="8" height="6" fill="#94a3b8"/><rect x="448" y="312" width="8" height="6" fill="#94a3b8"/>

              <line x1="400" y1="0" x2="400" y2="105" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="400" y1="235" x2="400" y2="340" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="376" y1="0" x2="376" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="0" x2="424" y2="105" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="376" y1="235" x2="376" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="424" y1="235" x2="424" y2="340" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Lane 2 (Kelkar Riverside Road) -->
              <rect x="0" y="122" width="800" height="96" fill="url(#roadAsphaltH)"/>
              <line x1="0" y1="122" x2="352" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="122" x2="800" y2="122" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="0" y1="218" x2="352" y2="218" stroke="#3f3f46" stroke-width="1.5"/>
              <line x1="448" y1="218" x2="800" y2="218" stroke="#3f3f46" stroke-width="1.5"/>

              <line x1="0" y1="170" x2="335" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="465" y1="170" x2="800" y2="170" stroke="#f59e0b" stroke-width="2" stroke-dasharray="8 6" stroke-opacity="0.85"/>
              <line x1="0" y1="146" x2="335" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="0" y1="194" x2="335" y2="194" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="146" x2="800" y2="146" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>
              <line x1="465" y1="194" x2="800" y2="194" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" stroke-dasharray="4 6"/>

              <!-- Bridge Pier Abutments Center Junction Box -->
              <rect x="352" y="122" width="96" height="96" fill="#0d0d10"/>
              <rect x="352" y="122" width="96" height="96" fill="url(#junctionBoxHatch)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="4 2" stroke-opacity="0.45"/>

              <!-- Crosswalks -->
              <g stroke="rgba(255,255,255,0.7)" stroke-width="3" stroke-linecap="butt">
                <line x1="356" y1="108" x2="444" y2="108" stroke-dasharray="6 6"/>
                <line x1="356" y1="114" x2="444" y2="114" stroke-dasharray="6 6"/>
                <line x1="356" y1="226" x2="444" y2="226" stroke-dasharray="6 6"/>
                <line x1="356" y1="232" x2="444" y2="232" stroke-dasharray="6 6"/>
                <line x1="338" y1="126" x2="338" y2="214" stroke-dasharray="6 6"/>
                <line x1="344" y1="126" x2="344" y2="214" stroke-dasharray="6 6"/>
                <line x1="456" y1="126" x2="456" y2="214" stroke-dasharray="6 6"/>
                <line x1="462" y1="126" x2="462" y2="214" stroke-dasharray="6 6"/>
              </g>

              <!-- Stop Lines -->
              <line x1="352" y1="120" x2="400" y2="120" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="400" y1="220" x2="448" y2="220" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="350" y1="170" x2="350" y2="218" stroke="#ffffff" stroke-width="3.5"/>
              <line x1="450" y1="122" x2="450" y2="170" stroke="#ffffff" stroke-width="3.5"/>

              ${getSignalHeadsSvg({ x: 326, y: 68 }, { x: 454, y: 230 }, { x: 296, y: 226 }, { x: 466, y: 96 })}
            </svg>
          `;
        }
      }
    };

    // ── Update Signal Heads & HUD Display ──
    function updateVisualDisplay() {
      const isNS = state.activeCorridor === 'NS';
      const isEW = state.activeCorridor === 'EW';
      const isAllRed = state.lightState === 'ALL_RED';

      const sigNS = isAllRed ? 'RED' : (isNS ? state.lightState : 'RED');
      const sigEW = isAllRed ? 'RED' : (isEW ? state.lightState : 'RED');

      // Independent Left & Right Turn Arrow status:
      const arrowL_NS = isAllRed ? 'OFF' : (isNS ? state.arrowL : 'OFF');
      const arrowR_NS = isAllRed ? 'OFF' : (isNS ? state.arrowR : 'OFF');
      const arrowL_EW = isAllRed ? 'OFF' : (isEW ? state.arrowL : 'OFF');
      const arrowR_EW = isAllRed ? 'OFF' : (isEW ? state.arrowR : 'OFF');

      function setLens(lensR, lensA, lensG, color, arrowL, arrowR, arrowL_State, arrowR_State) {
        if (!lensR || !lensA || !lensG) return;
        lensR.classList.toggle('active-red', color === 'RED');
        lensA.classList.toggle('active-amber', color === 'AMBER');
        lensG.classList.toggle('active-green', color === 'GREEN');
        if (arrowL) arrowL.classList.toggle('active-green', arrowL_State === 'GREEN');
        if (arrowR) arrowR.classList.toggle('active-green', arrowR_State === 'GREEN');
      }

      setLens(el.lensNR, el.lensNA, el.lensNG, sigNS, el.lensNArrowL, el.lensNArrowR, arrowL_NS, arrowR_NS);
      setLens(el.lensSR, el.lensSA, el.lensSG, sigNS, el.lensSArrowL, el.lensSArrowR, arrowL_NS, arrowR_NS);
      setLens(el.lensWR, el.lensWA, el.lensWG, sigEW, el.lensWArrowL, el.lensWArrowR, arrowL_EW, arrowR_EW);
      setLens(el.lensER, el.lensEA, el.lensEG, sigEW, el.lensEArrowL, el.lensEArrowR, arrowL_EW, arrowR_EW);

      const isHi = typeof I18N !== 'undefined' && I18N.CURRENT_LANG === 'hi';
      const toDigits = (v) => (typeof I18N !== 'undefined' && typeof I18N.toLocalizedDigits === 'function' ? I18N.toLocalizedDigits(v) : v);
      const t = (k, fb) => (typeof I18N !== 'undefined' && typeof I18N.t === 'function' ? I18N.t(k, fb) : fb);

      // Lane 1 HUD
      if (el.hudL1Badge) {
        if (arrowL_NS === 'GREEN' && arrowR_NS === 'OFF') {
          el.hudL1Badge.className = 'signal-badge green';
          el.hudL1Badge.textContent = `● ${t('sig_turn_left', '↰ LEFT ARROW GREEN')}`;
        } else if (arrowR_NS === 'GREEN' && arrowL_NS === 'OFF') {
          el.hudL1Badge.className = 'signal-badge green';
          el.hudL1Badge.textContent = `● ${t('sig_turn_right', '↱ RIGHT ARROW GREEN')}`;
        } else if (arrowL_NS === 'GREEN' && arrowR_NS === 'GREEN') {
          el.hudL1Badge.className = 'signal-badge green';
          el.hudL1Badge.textContent = `● ${t('sig_turn_both', '↰↱ TURN ARROWS GREEN')}`;
        } else {
          el.hudL1Badge.className = 'signal-badge ' + (sigNS === 'GREEN' ? 'green' : sigNS === 'AMBER' ? 'amber' : 'red');
          const sigKey = sigNS === 'GREEN' ? 'sig_green' : (sigNS === 'AMBER' ? 'sig_amber' : 'sig_red');
          el.hudL1Badge.textContent = `● ${t(sigKey, sigNS)}`;
        }
      }
      if (el.hudL1Pcu) el.hudL1Pcu.textContent = toDigits(Number(state.pcu.NS).toFixed(1));
      if (el.hudL1Veh) el.hudL1Veh.textContent = toDigits(state.totals.NS);
      if (el.hudL1Queue) el.hudL1Queue.textContent = toDigits(state.queues.NS) + (isHi ? ' मी' : 'm');
      if (el.hudL1Bar) {
        const pct = Math.min(100, Math.round((state.pcu.NS / 30) * 100));
        el.hudL1Bar.style.width = pct + '%';
        el.hudL1Bar.style.background = sigNS === 'RED' && pct > 50 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #38bdf8, #10b981)';
      }
      if (el.btnStopL1) {
        const isL1Stopped = state.regulationMode === 'MANUAL_STOP_L1' || (state.regulationMode === 'ALL_RED');
        el.btnStopL1.textContent = isL1Stopped ? t('btn_release_lane_1', 'RELEASE LANE 1 (FLOW)') : t('btn_stop_lane_1', 'STOP LANE 1 (RED)');
        el.btnStopL1.classList.toggle('release-mode', isL1Stopped);
      }

      // Lane 2 HUD
      if (el.hudL2Badge) {
        if (arrowL_EW === 'GREEN' && arrowR_EW === 'OFF') {
          el.hudL2Badge.className = 'signal-badge green';
          el.hudL2Badge.textContent = `● ${t('sig_turn_left', '↰ LEFT ARROW GREEN')}`;
        } else if (arrowR_EW === 'GREEN' && arrowL_EW === 'OFF') {
          el.hudL2Badge.className = 'signal-badge green';
          el.hudL2Badge.textContent = `● ${t('sig_turn_right', '↱ RIGHT ARROW GREEN')}`;
        } else if (arrowL_EW === 'GREEN' && arrowR_EW === 'GREEN') {
          el.hudL2Badge.className = 'signal-badge green';
          el.hudL2Badge.textContent = `● ${t('sig_turn_both', '↰↱ TURN ARROWS GREEN')}`;
        } else {
          el.hudL2Badge.className = 'signal-badge ' + (sigEW === 'GREEN' ? 'green' : sigEW === 'AMBER' ? 'amber' : 'red');
          const sigKey = sigEW === 'GREEN' ? 'sig_green' : (sigEW === 'AMBER' ? 'sig_amber' : 'sig_red');
          el.hudL2Badge.textContent = `● ${t(sigKey, sigEW)}`;
        }
      }
      if (el.hudL2Pcu) el.hudL2Pcu.textContent = toDigits(Number(state.pcu.EW).toFixed(1));
      if (el.hudL2Veh) el.hudL2Veh.textContent = toDigits(state.totals.EW);
      if (el.hudL2Queue) el.hudL2Queue.textContent = toDigits(state.queues.EW) + (isHi ? ' मी' : 'm');
      if (el.hudL2Bar) {
        const pct = Math.min(100, Math.round((state.pcu.EW / 30) * 100));
        el.hudL2Bar.style.width = pct + '%';
        el.hudL2Bar.style.background = sigEW === 'RED' && pct > 50 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #38bdf8, #10b981)';
      }
      if (el.btnStopL2) {
        const isL2Stopped = state.regulationMode === 'MANUAL_STOP_L2' || (state.regulationMode === 'ALL_RED');
        el.btnStopL2.textContent = isL2Stopped ? t('btn_release_lane_2', 'RELEASE LANE 2 (FLOW)') : t('btn_stop_lane_2', 'STOP LANE 2 (RED)');
        el.btnStopL2.classList.toggle('release-mode', isL2Stopped);
      }

      // HUD Static Labels
      document.querySelectorAll('.lane-hud-card [data-i18n="stat_vehicles"]').forEach(span => {
        span.textContent = t('stat_vehicles', 'Vehicles');
      });
      document.querySelectorAll('.lane-hud-card [data-i18n="pcu_load"]').forEach(span => {
        span.textContent = t('pcu_load', 'PCU Load');
      });
      document.querySelectorAll('.lane-hud-card [data-i18n="queue_len"]').forEach(span => {
        span.textContent = t('queue_len', 'Queue');
      });

      // Telemetry
      if (el.hudPhaseTimer) {
        el.hudPhaseTimer.textContent = isHi
          ? ('चरण: ' + toDigits(Number(state.timeInPhase).toFixed(1)) + ' से')
          : ('Phase: ' + Number(state.timeInPhase).toFixed(1) + 's');
      }
      if (el.hudMinGreenTimer) {
        if (state.regulationMode !== 'ADAPTIVE') {
          el.hudMinGreenTimer.textContent = t('manual_takeover_active', 'Manual Takeover Active');
        } else {
          const rem = Math.max(0, 10 - state.timeInPhase);
          el.hudMinGreenTimer.textContent = rem > 0
            ? (isHi ? ('न्यूनतम हरा: ' + toDigits(rem.toFixed(1)) + ' से शेष') : ('Min Green: ' + rem.toFixed(1) + 's left'))
            : t('density_regulated', 'Density Regulated');
        }
      }
      if (el.hudCycleCount) {
        el.hudCycleCount.textContent = isHi
          ? ('चक्र #' + toDigits(state.cycleCount))
          : ('Cycle #' + state.cycleCount);
      }

      // Mode Badge
      if (el.modeBadge) {
        el.modeBadge.className = 'junction-mode-badge';
        if (state.regulationMode === 'MANUAL_STOP_L1') {
          el.modeBadge.classList.add('manual');
          el.modeBadge.textContent = `● ${t('mode_manual_l1_stopped', 'MANUAL: LANE 1 STOPPED')}`;
        } else if (state.regulationMode === 'MANUAL_STOP_L2') {
          el.modeBadge.classList.add('manual');
          el.modeBadge.textContent = `● ${t('mode_manual_l2_stopped', 'MANUAL: LANE 2 STOPPED')}`;
        } else if (state.regulationMode === 'ALL_RED') {
          el.modeBadge.classList.add('all-red');
          el.modeBadge.textContent = `● ${t('mode_all_red_hold', 'ALL RED HOLD')}`;
        } else {
          el.modeBadge.textContent = `● ${t('mode_auto_density', 'AUTO ATSC (DENSITY)')}`;
        }
      }
    }

    // ── Signal Heads & Camera Junction Swapping ──
    function rebindSignalLenses() {
      el.lensNR = document.getElementById('sigLensN_R');
      el.lensNA = document.getElementById('sigLensN_A');
      el.lensNG = document.getElementById('sigLensN_G');
      el.lensNArrowL = document.getElementById('sigLensN_ArrowL');
      el.lensNArrowR = document.getElementById('sigLensN_ArrowR');

      el.lensSR = document.getElementById('sigLensS_R');
      el.lensSA = document.getElementById('sigLensS_A');
      el.lensSG = document.getElementById('sigLensS_G');
      el.lensSArrowL = document.getElementById('sigLensS_ArrowL');
      el.lensSArrowR = document.getElementById('sigLensS_ArrowR');

      el.lensWR = document.getElementById('sigLensW_R');
      el.lensWA = document.getElementById('sigLensW_A');
      el.lensWG = document.getElementById('sigLensW_G');
      el.lensWArrowL = document.getElementById('sigLensW_ArrowL');
      el.lensWArrowR = document.getElementById('sigLensW_ArrowR');

      el.lensER = document.getElementById('sigLensE_R');
      el.lensEA = document.getElementById('sigLensE_A');
      el.lensEG = document.getElementById('sigLensE_G');
      el.lensEArrowL = document.getElementById('sigLensE_ArrowL');
      el.lensEArrowR = document.getElementById('sigLensE_ArrowR');
    }

    function switchJunctionCamera(camId, options = {}) {
      if (!JUNCTION_LAYOUTS[camId]) camId = 'CAM-01';
      state.currentCameraId = camId;
      const layout = JUNCTION_LAYOUTS[camId];
      state.currentLayout = layout;

      // 1. Swap SVG road cut schematics
      const svgLayer = document.getElementById('junctionRoadsSvgLayer');
      if (svgLayer) {
        svgLayer.innerHTML = layout.getSvg();
      }

      // 2. Rebind signal lens DOM pointers to new SVG
      rebindSignalLenses();

      // 3. Update Minimap Header & HUD corridor titles
      const titleEl = document.getElementById('junctionMinimapTitle');
      if (titleEl) titleEl.textContent = layout.title.toUpperCase();

      const badgeEl = document.getElementById('junctionNodeBadge');
      if (badgeEl) badgeEl.textContent = layout.badge;

      const l1Title = document.getElementById('hudLane1Title');
      if (l1Title) l1Title.textContent = layout.lane1.toUpperCase();

      const l2Title = document.getElementById('hudLane2Title');
      if (l2Title) l2Title.textContent = layout.lane2.toUpperCase();

      // Update junction camera chips active class if present
      document.querySelectorAll('.junc-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-cam') === camId);
      });

      // 4. Update PIP preview if present on GIS map
      if (typeof window.updateGisMinimapPip === 'function') {
        window.updateGisMinimapPip(camId, layout);
      }

      // 5. Synchronize with Leaflet GIS map below
      if (!options.skipGis && typeof window._highlightGisCamera === 'function') {
        window._highlightGisCamera(camId);
      }

      // 6. Adapt and reseed fleet vehicles onto this specific junction
      seedInitialVehicles();

      // 7. Refresh lights & telemetry display
      updateVisualDisplay();

      // 8. Dispatch event for other subscribers
      window.dispatchEvent(new CustomEvent('junctionCameraSwitched', { detail: { camId, layout } }));
    }

    // Expose globally for GIS map and external callers
    window.switchJunctionCamera = switchJunctionCamera;
    window.JUNCTION_LAYOUTS = JUNCTION_LAYOUTS;

    // ── Apply Incoming Backend Telemetry ──
    function applyTelemetry(data) {
      if (!data) return;
      if (data.active_corridor) state.activeCorridor = data.active_corridor;
      if (data.light_state) state.lightState = data.light_state;
      if (data.time_in_phase_sec !== undefined) state.timeInPhase = data.time_in_phase_sec;
      if (data.cycle_count !== undefined) state.cycleCount = data.cycle_count;
      if (data.regulation_mode) state.regulationMode = data.regulation_mode;
      if (data.arrow_l) state.arrowL = data.arrow_l;
      if (data.arrow_r) state.arrowR = data.arrow_r;

      updateVisualDisplay();
    }

    // ── Backend WebSocket & Polling Sync ──
    function initBackendSync() {
      let ws = null;
      function connectWS() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:8000';
        const wsUrl = `${protocol}//${host}/ws/junction-telemetry`;

        try {
          ws = new WebSocket(wsUrl);
          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              applyTelemetry(data);
            } catch (e) {}
          };
          ws.onerror = () => { if (ws) ws.close(); };
          ws.onclose = () => { setTimeout(connectWS, 5000); };
        } catch (e) {}
      }

      function fetchState() {
        fetch('/api/junction/minimap')
          .then(res => res.json())
          .then(data => applyTelemetry(data))
          .catch(() => {});
      }

      connectWS();
      fetchState();
      setInterval(fetchState, 3000);
    }

    // ── Interactive Override Actions ──
    function initOverrides() {
      function sendOverride(action, mode) {
        state.regulationMode = mode;
        state.arrowL = 'OFF';
        state.arrowR = 'OFF';
        if (mode === 'MANUAL_STOP_L1') {
          state.activeCorridor = 'EW';
          state.lightState = 'GREEN';
          state.subPhase = 'THROUGH';
          state.timeInPhase = 0;
        } else if (mode === 'MANUAL_STOP_L2') {
          state.activeCorridor = 'NS';
          state.lightState = 'GREEN';
          state.subPhase = 'THROUGH';
          state.timeInPhase = 0;
        } else if (mode === 'ALL_RED') {
          state.lightState = 'ALL_RED';
          state.subPhase = 'ALL_RED';
          state.timeInPhase = 0;
        } else if (mode === 'ADAPTIVE') {
          state.subPhase = 'THROUGH';
          state.lightState = 'GREEN';
          state.timeInPhase = 0;
        }

        updateVisualDisplay();

        fetch('/api/junction/regulation-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action })
        })
          .then(res => res.json())
          .then(res => {
            if (res.snapshot) applyTelemetry(res.snapshot);
          })
          .catch(() => {});
      }

      function setActiveToolbar(btn) {
        [el.btnAuto, el.btnForceL1, el.btnForceL2, el.btnAllRed].forEach(b => {
          if (b) b.classList.remove('active');
        });
        if (btn) btn.classList.add('active');
      }

      if (el.btnAuto) {
        el.btnAuto.addEventListener('click', () => {
          setActiveToolbar(el.btnAuto);
          sendOverride('RESUME_AUTO', 'ADAPTIVE');
          notify('[AUTO ATSC] Resumed adaptive density-based signal balancing.', 'info');
        });
      }

      // Stop Lane 2 / Flow Lane 1 (North-South)
      if (el.btnForceL1) {
        el.btnForceL1.addEventListener('click', () => {
          setActiveToolbar(el.btnForceL1);
          sendOverride('STOP_LANE_2', 'MANUAL_STOP_L2');
          notify('[MANUAL OVERRIDE] Lane 2 (EW) STOPPED. Lane 1 (NS) given continuous green wave.', 'info');
        });
      }

      // Stop Lane 1 / Flow Lane 2 (East-West)
      if (el.btnForceL2) {
        el.btnForceL2.addEventListener('click', () => {
          setActiveToolbar(el.btnForceL2);
          sendOverride('STOP_LANE_1', 'MANUAL_STOP_L1');
          notify('[MANUAL OVERRIDE] Lane 1 (NS) STOPPED. Lane 2 (EW) given continuous green wave.', 'info');
        });
      }

      // Emergency All-Red Hold
      if (el.btnAllRed) {
        el.btnAllRed.addEventListener('click', () => {
          setActiveToolbar(el.btnAllRed);
          sendOverride('ALL_RED', 'ALL_RED');
          notify('[EMERGENCY ALL-RED] All signals held RED. Traffic stopping in all directions.', 'warning');
        });
      }

      // HUD Button: Direct Stop/Release Lane 1
      if (el.btnStopL1) {
        el.btnStopL1.addEventListener('click', () => {
          if (state.regulationMode === 'MANUAL_STOP_L1') {
            setActiveToolbar(el.btnAuto);
            sendOverride('RESUME_AUTO', 'ADAPTIVE');
            notify('[RELEASE] Lane 1 released. Resuming adaptive signal regulation.', 'success');
          } else {
            setActiveToolbar(el.btnForceL2);
            sendOverride('STOP_LANE_1', 'MANUAL_STOP_L1');
            notify('[STOP] Lane 1 (NS) manually stopped with RED signal.', 'warning');
          }
        });
      }

      // HUD Button: Direct Stop/Release Lane 2
      if (el.btnStopL2) {
        el.btnStopL2.addEventListener('click', () => {
          if (state.regulationMode === 'MANUAL_STOP_L2') {
            setActiveToolbar(el.btnAuto);
            sendOverride('RESUME_AUTO', 'ADAPTIVE');
            notify('[RELEASE] Lane 2 released. Resuming adaptive signal regulation.', 'success');
          } else {
            setActiveToolbar(el.btnForceL1);
            sendOverride('STOP_LANE_2', 'MANUAL_STOP_L2');
            notify('[STOP] Lane 2 (EW) manually stopped with RED signal.', 'warning');
          }
        });
      }

      // Density adjustments
      if (el.btnDensityUp) {
        el.btnDensityUp.addEventListener('click', () => {
          state.densityMultiplier = Math.min(2.5, state.densityMultiplier + 0.3);
          notify(`Traffic density set to ${(state.densityMultiplier * 100).toFixed(0)}%`, 'info');
        });
      }

      if (el.btnDensityDown) {
        el.btnDensityDown.addEventListener('click', () => {
          state.densityMultiplier = Math.max(0.4, state.densityMultiplier - 0.3);
          notify(`Traffic density set to ${(state.densityMultiplier * 100).toFixed(0)}%`, 'info');
        });
      }

      if (el.btnCenter) {
        el.btnCenter.addEventListener('click', () => {
          vehicles.length = 0;
          seedInitialVehicles();
          notify('Junction traffic simulation reset.', 'info');
        });
      }

      // Junction Camera Switcher Chips
      document.querySelectorAll('.junc-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const cid = chip.getAttribute('data-cam');
          if (cid) switchJunctionCamera(cid);
        });
      });
    }

    // Local ATSC Density Regulation Ticker (Independent Turn Arrow Phasing)
    function runLocalTicker() {
      setInterval(() => {
        const now = Date.now();
        const delta = (now - state.lastTick) / 1000;
        state.lastTick = now;

        state.timeInPhase += delta;

        // In Adaptive mode, phase changes dynamically through through-green, through-amber, protected turn arrows, and all-red clearance
        if (state.regulationMode === 'ADAPTIVE') {
          const isNS = state.activeCorridor === 'NS';
          const activeQueue = isNS ? state.queues.NS : state.queues.EW;
          const waitingQueue = isNS ? state.queues.EW : state.queues.NS;
          const activePcu = isNS ? state.pcu.NS : state.pcu.EW;
          const waitingPcu = isNS ? state.pcu.EW : state.pcu.NS;

          if (state.subPhase === 'TURN_LEFT_ARROW') {
            // Stage 1: Leading Protected Left Turn Arrow (FIRST!)
            state.lightState = 'RED';
            state.arrowL = 'GREEN';
            state.arrowR = 'OFF';
            if (state.timeInPhase >= 4.0) {
              // Stage 2: Leading Protected Right Turn Arrow (SECOND!)
              state.subPhase = 'TURN_RIGHT_ARROW';
              state.lightState = 'RED';
              state.arrowL = 'OFF';
              state.arrowR = 'GREEN';
              state.timeInPhase = 0;
            }
          } else if (state.subPhase === 'TURN_RIGHT_ARROW') {
            state.lightState = 'RED';
            state.arrowL = 'OFF';
            state.arrowR = 'GREEN';
            if (state.timeInPhase >= 4.0) {
              // Stage 3: Turn Amber Transition
              state.subPhase = 'TURN_AMBER';
              state.lightState = 'AMBER';
              state.arrowL = 'OFF';
              state.arrowR = 'OFF';
              state.timeInPhase = 0;
            }
          } else if (state.subPhase === 'TURN_AMBER') {
            state.lightState = 'AMBER';
            state.arrowL = 'OFF';
            state.arrowR = 'OFF';
            if (state.timeInPhase >= 1.8) {
              // Stage 4: Main Through Green (THEN THE GREEN LIGHT TURNS ON!)
              state.subPhase = 'THROUGH';
              state.lightState = 'GREEN';
              state.arrowL = 'OFF';
              state.arrowR = 'OFF';
              state.timeInPhase = 0;
            }
          } else if (state.subPhase === 'THROUGH') {
            state.lightState = 'GREEN';
            state.arrowL = 'OFF';
            state.arrowR = 'OFF';

            const minThroughMet = state.timeInPhase >= 8.0;
            const maxThroughReached = state.timeInPhase >= 14.0;
            const queueDischarged = minThroughMet && (activeQueue === 0) && (waitingQueue > 0);
            const densityImbalance = (state.timeInPhase >= 10.0) && (waitingPcu > activePcu * 1.35);

            if (maxThroughReached || queueDischarged || densityImbalance) {
              // Stage 5: Main Through Amber
              state.subPhase = 'THROUGH_AMBER';
              state.lightState = 'AMBER';
              state.arrowL = 'OFF';
              state.arrowR = 'OFF';
              state.timeInPhase = 0;
            }
          } else if (state.subPhase === 'THROUGH_AMBER') {
            state.lightState = 'AMBER';
            state.arrowL = 'OFF';
            state.arrowR = 'OFF';
            if (state.timeInPhase >= 2.5) {
              // Stage 6: All-Red Junction Clearance (2.0s)
              state.subPhase = 'ALL_RED';
              state.lightState = 'ALL_RED';
              state.arrowL = 'OFF';
              state.arrowR = 'OFF';
              state.timeInPhase = 0;
            }
          } else if (state.subPhase === 'ALL_RED') {
            state.lightState = 'ALL_RED';
            state.arrowL = 'OFF';
            state.arrowR = 'OFF';
            if (state.timeInPhase >= 2.0) {
              // Full junction clearance complete, switch corridor!
              state.activeCorridor = (state.activeCorridor === 'NS' ? 'EW' : 'NS');
              // IN THE NEW CORRIDOR, FIRST TURN ARROWS TURN ON!
              state.subPhase = 'TURN_LEFT_ARROW';
              state.lightState = 'RED';
              state.arrowL = 'GREEN';
              state.arrowR = 'OFF';
              state.timeInPhase = 0;
              state.cycleCount += 1;
            }
          }
        } else if (state.regulationMode === 'ALL_RED') {
          state.lightState = 'ALL_RED';
          state.arrowL = 'OFF';
          state.arrowR = 'OFF';
        } else if (state.regulationMode === 'MANUAL_STOP_L1') {
          state.activeCorridor = 'EW';
          state.lightState = 'GREEN';
          state.arrowL = 'OFF';
          state.arrowR = 'OFF';
        } else if (state.regulationMode === 'MANUAL_STOP_L2') {
          state.activeCorridor = 'NS';
          state.lightState = 'GREEN';
          state.arrowL = 'OFF';
          state.arrowR = 'OFF';
        }

        updateVisualDisplay();
      }, 100);
    }

    // Vehicle Simulation & Anti-Collision Physics Engine (Indian Road Dynamics)
    const vehicles = [];
    let nextVehId = 1;
    let hoveredVehicle = null;
    let pinnedVehicle = null;
    const tooltipEl = document.getElementById('vehicleTooltip');

    // Bind cross-module accessors
    getMinimapVehicles = () => vehicles;
    getMinimapState = () => state;

    // 5 Realistic Indian Vehicle Classes with Authentic Pune / Maharashtra Fleet Models
    const VEHICLE_DEFS = [
      {
        type: 'bike',
        name: 'Two-Wheeler (Motorcycle / Scooter)',
        models: ['Bajaj Pulsar 220F', 'Honda Activa 6G', 'Royal Enfield Classic 350', 'TVS Apache RTR', 'Hero Splendor Plus'],
        length: 13,
        width: 6,
        speed: 2.7,
        pcu: 0.5,
        prob: 0.28,
        colors: ['#38bdf8', '#ef4444', '#f59e0b', '#10b981', '#a855f7'],
        canFilter: true
      },
      {
        type: 'auto',
        name: 'Three-Wheeler (Auto-Rickshaw)',
        models: ['Bajaj RE Compact CNG', 'Piaggio Ape Auto DX', 'Mahindra Treo Electric'],
        length: 16,
        width: 9,
        speed: 1.85,
        pcu: 0.8,
        prob: 0.22,
        colors: ['#eab308', '#22c55e', '#f97316'],
        canFilter: true
      },
      {
        type: 'car',
        name: 'Four-Wheeler (Car / Taxi / SUV)',
        models: ['Mahindra Scorpio-N', 'Tata Nexon EV', 'Maruti Suzuki Dzire', 'Hyundai Creta', 'Toyota Innova Crysta'],
        length: 22,
        width: 11,
        speed: 2.2,
        pcu: 1.0,
        prob: 0.28,
        colors: ['#f1f5f9', '#94a3b8', '#38bdf8', '#334155', '#dc2626'],
        canFilter: false
      },
      {
        type: 'tempo',
        name: 'Light Commercial (Tempo / Mini-Truck)',
        models: ['Tata Ace Gold (Chhota Hathi)', 'Mahindra Bolero Maxi Truck', 'Ashok Leyland Dost'],
        length: 26,
        width: 12,
        speed: 1.35,
        pcu: 1.6,
        prob: 0.14,
        colors: ['#f8fafc', '#cbd5e1', '#64748b', '#0284c7'],
        canFilter: false
      },
      {
        type: 'truck_bus',
        name: 'Heavy Vehicle (City Bus / Heavy Truck)',
        models: ['PMPML City Transit Bus', 'Tata 407 Cargo Hauler', 'BharatBenz 1617 Heavy Hauler'],
        length: 36,
        width: 14,
        speed: 1.05,
        pcu: 2.8,
        prob: 0.08,
        colors: ['#dc2626', '#d97706', '#2563eb', '#475569'],
        canFilter: false
      }
    ];

    function getRandomVehicleDef() {
      const rand = Math.random();
      let acc = 0;
      for (const vt of VEHICLE_DEFS) {
        acc += vt.prob;
        if (rand <= acc) return vt;
      }
      return VEHICLE_DEFS[0];
    }

    function generateIndianPlate() {
      const rto = ['MH 12', 'MH 14', 'MH 02', 'MH 01', 'MH 20', 'MH 31'][Math.floor(Math.random() * 6)];
      const series = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const num = String(Math.floor(1000 + Math.random() * 9000));
      return `${rto} ${series} ${num}`;
    }

    // ── Road Geometry & Stop Line Helpers for Adaptive Junction Cuts ──
    function getStopLine(laneKey) {
      const sl = (state.currentLayout && state.currentLayout.stopLines) ? state.currentLayout.stopLines : { N: 114, S: 226, W: 344, E: 456 };
      if (laneKey === 'NS_SB') return sl.N;
      if (laneKey === 'NS_NB') return sl.S;
      if (laneKey === 'EW_EB') return sl.W;
      if (laneKey === 'EW_WB') return sl.E;
      return 0;
    }

    function getRoadY(laneKey, lateral, x, layoutType) {
      if (laneKey.startsWith('NS')) return null;
      const type = layoutType || (state.currentLayout ? state.currentLayout.type : 'skewed_65');

      if (type === 'skewed_65') {
        // Centerline (0, 238) to (800, 102) -> dy/dx = -136 / 800 = -0.17
        return lateral - 0.17 * (x - 400);
      }
      if (type === 'oblique_75') {
        // Centerline (0, 222) to (800, 150) -> dy/dx = -72 / 800 = -0.09
        return lateral - 0.09 * (x - 400);
      }
      if (type === 'y_fork') {
        // West fork entrance merges from y=265 at x=0 into y=194 at x=352 (slope = -0.2017)
        if (laneKey === 'EW_EB' && x <= 352) {
          return lateral - 0.2017 * (x - 352);
        }
        return lateral;
      }
      if (type === 'offset_staggered') {
        // West approach: EW_EB at southern half (148, 172); EW_WB at northern half (100, 124)
        // East approach: EW_EB at southern half (216, 240); EW_WB at northern half (168, 192)
        // Smooth Hermite transition through junction box (x=352..448), constant delta = 68px
        if (laneKey === 'EW_EB') {
          if (x <= 352) return lateral;
          if (x >= 448) return lateral + 68;
          const t = (x - 352) / 96;
          const st = t * t * (3 - 2 * t);
          return lateral + 68 * st;
        } else if (laneKey === 'EW_WB') {
          if (x >= 448) return lateral;
          if (x <= 352) return lateral - 68;
          const t = (448 - x) / 96;
          const st = t * t * (3 - 2 * t);
          return lateral - 68 * st;
        }
      }
      return lateral;
    }

    function getRoadHeading(laneKey, x, layoutType) {
      const type = layoutType || (state.currentLayout ? state.currentLayout.type : 'skewed_65');
      if (laneKey === 'NS_SB') return Math.PI / 2;
      if (laneKey === 'NS_NB') return -Math.PI / 2;

      if (type === 'skewed_65') {
        // Eastbound points up-right (-9.65°); Westbound points down-left (170.35°)
        return laneKey === 'EW_EB' ? Math.atan2(-0.17, 1) : Math.atan2(0.17, -1);
      }
      if (type === 'oblique_75') {
        return laneKey === 'EW_EB' ? Math.atan2(-0.09, 1) : Math.atan2(0.09, -1);
      }
      if (type === 'y_fork') {
        if (laneKey === 'EW_EB') {
          if (x <= 335) {
            return Math.atan2(-0.2017, 1);
          } else if (x < 370) {
            // Smooth natural turn from -11.4° into straight 0° through the box
            const t = (x - 335) / 35;
            const slope = -0.2017 * (1 - t * t * (3 - 2 * t));
            return Math.atan2(slope, 1);
          }
          return 0;
        }
        return laneKey === 'EW_EB' ? 0 : Math.PI;
      }
      if (type === 'offset_staggered') {
        if (laneKey === 'EW_EB') {
          if (x > 352 && x < 448) {
            const t = (x - 352) / 96;
            const slope = (68 / 96) * 6 * t * (1 - t);
            return Math.atan2(slope, 1);
          }
          return 0;
        } else if (laneKey === 'EW_WB') {
          if (x > 352 && x < 448) {
            const t = (448 - x) / 96;
            const slope = (-68 / 96) * 6 * t * (1 - t);
            return Math.atan2(-slope, -1);
          }
          return Math.PI;
        }
      }
      return laneKey === 'EW_EB' ? 0 : Math.PI;
    }

    // ── DEFINITIVE PARAMETRIC CUBIC BÉZIER TURN PATHS ──
    // 8 Exact, continuous spline curves (t in [0, 1]) locking turning vehicles to invisible rails
    const DEFINITIVE_TURN_PATHS = {
      // 1. Southbound U-Turn (Median lane x=388 -> Northbound median lane x=412)
      'U_TURN_NS_SB': {
        p0: { x: 388, y: 135 },
        p1: { x: 388, y: 175 },
        p2: { x: 412, y: 175 },
        p3: { x: 412, y: 135 },
        length: 110,
        targetLane: 'NS_NB',
        targetSubLane: 0,
        targetLateral: 412,
        targetHeading: -Math.PI / 2
      },
      // 2. Northbound U-Turn (Median lane x=412 -> Southbound median lane x=388)
      'U_TURN_NS_NB': {
        p0: { x: 412, y: 205 },
        p1: { x: 412, y: 165 },
        p2: { x: 388, y: 165 },
        p3: { x: 388, y: 205 },
        length: 110,
        targetLane: 'NS_SB',
        targetSubLane: 1,
        targetLateral: 388,
        targetHeading: Math.PI / 2
      },
      // 3. Eastbound U-Turn (Median lane y=182 -> Westbound median lane y=158)
      'U_TURN_EW_EB': {
        p0: { x: 365, y: 182 },
        p1: { x: 405, y: 182 },
        p2: { x: 405, y: 158 },
        p3: { x: 365, y: 158 },
        length: 110,
        targetLane: 'EW_WB',
        targetSubLane: 1,
        targetLateral: 158,
        targetHeading: Math.PI
      },
      // 4. Westbound U-Turn (Median lane y=158 -> Eastbound median lane y=182)
      'U_TURN_EW_WB': {
        p0: { x: 435, y: 158 },
        p1: { x: 395, y: 158 },
        p2: { x: 395, y: 182 },
        p3: { x: 435, y: 182 },
        length: 110,
        targetLane: 'EW_EB',
        targetSubLane: 0,
        targetLateral: 182,
        targetHeading: 0
      },
      // 5. Southbound 90° Left Turn (Curb lane x=366 -> Eastbound curb lane y=206)
      'TURN_LEFT_NS_SB': {
        p0: { x: 366, y: 125 },
        p1: { x: 366, y: 175 },
        p2: { x: 405, y: 206 },
        p3: { x: 455, y: 206 },
        length: 135,
        targetLane: 'EW_EB',
        targetSubLane: 1,
        targetLateral: 206,
        targetHeading: 0
      },
      // 6. Northbound 90° Left Turn (Curb lane x=436 -> Westbound curb lane y=134)
      'TURN_LEFT_NS_NB': {
        p0: { x: 436, y: 215 },
        p1: { x: 436, y: 165 },
        p2: { x: 395, y: 134 },
        p3: { x: 345, y: 134 },
        length: 135,
        targetLane: 'EW_WB',
        targetSubLane: 0,
        targetLateral: 134,
        targetHeading: Math.PI
      },
      // 7. Eastbound 90° Left Turn (Curb lane y=206 -> Northbound curb lane x=436)
      'TURN_LEFT_EW_EB': {
        p0: { x: 345, y: 206 },
        p1: { x: 395, y: 206 },
        p2: { x: 436, y: 175 },
        p3: { x: 436, y: 125 },
        length: 135,
        targetLane: 'NS_NB',
        targetSubLane: 1,
        targetLateral: 436,
        targetHeading: -Math.PI / 2
      },
      // 8. Westbound 90° Left Turn (Curb lane y=134 -> Southbound curb lane x=366)
      'TURN_LEFT_EW_WB': {
        p0: { x: 455, y: 134 },
        p1: { x: 405, y: 134 },
        p2: { x: 366, y: 165 },
        p3: { x: 366, y: 215 },
        length: 135,
        targetLane: 'NS_SB',
        targetSubLane: 0,
        targetLateral: 366,
        targetHeading: Math.PI / 2
      },
      // 9. Southbound 90° Right Turn (Median lane x=388 -> Westbound outer lane y=158)
      'TURN_RIGHT_NS_SB': {
        p0: { x: 388, y: 125 },
        p1: { x: 388, y: 158 },
        p2: { x: 370, y: 158 },
        p3: { x: 345, y: 158 },
        length: 135,
        targetLane: 'EW_WB',
        targetSubLane: 1,
        targetLateral: 158,
        targetHeading: Math.PI
      },
      // 10. Northbound 90° Right Turn (Median lane x=412 -> Eastbound inner lane y=182)
      'TURN_RIGHT_NS_NB': {
        p0: { x: 412, y: 215 },
        p1: { x: 412, y: 182 },
        p2: { x: 430, y: 182 },
        p3: { x: 455, y: 182 },
        length: 135,
        targetLane: 'EW_EB',
        targetSubLane: 0,
        targetLateral: 182,
        targetHeading: 0
      },
      // 11. Eastbound 90° Right Turn (Median lane y=182 -> Southbound median lane x=388)
      'TURN_RIGHT_EW_EB': {
        p0: { x: 345, y: 182 },
        p1: { x: 388, y: 182 },
        p2: { x: 388, y: 195 },
        p3: { x: 388, y: 225 },
        length: 135,
        targetLane: 'NS_SB',
        targetSubLane: 1,
        targetLateral: 388,
        targetHeading: Math.PI / 2
      },
      // 12. Westbound 90° Right Turn (Median lane y=158 -> Northbound median lane x=412)
      'TURN_RIGHT_EW_WB': {
        p0: { x: 455, y: 158 },
        p1: { x: 412, y: 158 },
        p2: { x: 412, y: 145 },
        p3: { x: 412, y: 115 },
        length: 135,
        targetLane: 'NS_NB',
        targetSubLane: 0,
        targetLateral: 412,
        targetHeading: -Math.PI / 2
      }
    };

    function evalCubicBezier(p0, p1, p2, p3, t) {
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;

      const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
      const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;

      const dx = 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x);
      const dy = 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y);
      const heading = Math.atan2(dy, dx);

      return { x, y, dx, dy, heading };
    }

    // ── Dynamic Junction Zone Bounds ──
    function getJunctionZone() {
      if (state.currentLayout && state.currentLayout.junctionZone) return state.currentLayout.junctionZone;
      return { xMin: 340, xMax: 460, yMin: 108, yMax: 230 };
    }

    // Two parallel sub-lanes per directional approach (Allows 2 vehicles side-by-side)
    // Adapts Y positions for offset_staggered where west approach (y=88-184) and east (y=156-252) differ
    function getSubLaneCoord(laneKey, subLane) {
      if (laneKey === 'NS_SB') return subLane === 0 ? 366 : 388; // Road X: 352-400 (48px wide)
      if (laneKey === 'NS_NB') return subLane === 0 ? 412 : 436; // Road X: 400-448 (48px wide)

      const type = state.currentLayout ? state.currentLayout.type : 'square_90';
      if (type === 'offset_staggered') {
        // West approach: road y=88..184, center=136 → EB (southern half 136..184) at 148, 172
        // East approach: road y=156..252, center=204 → WB (northern half 156..204) at 168, 192
        if (laneKey === 'EW_EB') return subLane === 0 ? 148 : 172;
        if (laneKey === 'EW_WB') return subLane === 0 ? 168 : 192;
      }

      if (type === 'oblique_75') {
        // Road centerline at x=400 is 186. WB (138..186) sub-lanes at 150, 174. EB (186..234) sub-lanes at 198, 222.
        if (laneKey === 'EW_EB') return subLane === 0 ? 198 : 222;
        if (laneKey === 'EW_WB') return subLane === 0 ? 150 : 174;
      }

      if (laneKey === 'EW_EB') return subLane === 0 ? 182 : 206; // Road Y: 170-218 (48px wide)
      if (laneKey === 'EW_WB') return subLane === 0 ? 134 : 158; // Road Y: 122-170 (48px wide)
      return 0;
    }

    function isBeforeExit(v) {
      const jz = getJunctionZone();
      if (v.lane === 'NS_SB') return v.y < jz.yMax;
      if (v.lane === 'NS_NB') return v.y > jz.yMin;
      if (v.lane === 'EW_EB') return v.x < jz.xMax;
      if (v.lane === 'EW_WB') return v.x > jz.xMin;
      return false;
    }

    function canSpawnLane(laneKey, subLane) {
      return !vehicles.some(v => {
        if (v.lane !== laneKey) return false;
        const targetLat = getSubLaneCoord(laneKey, subLane);
        const isNearLateral = (v.subLane === subLane || Math.abs(v.lateral - targetLat) < 18);
        const reqBuffer = isNearLateral ? 110 : 65;
        if (laneKey === 'NS_SB') return v.y < reqBuffer;
        if (laneKey === 'NS_NB') return v.y > (340 - reqBuffer);
        if (laneKey === 'EW_EB') return v.x < reqBuffer;
        if (laneKey === 'EW_WB') return v.x > (800 - reqBuffer);
        return false;
      });
    }

    function spawnVehicle(laneKey, subLane, customPos) {
      const def = getRandomVehicleDef();
      const chosenSub = subLane !== undefined ? subLane : (Math.random() < 0.5 ? 0 : 1);
      const latCoord = getSubLaneCoord(laneKey, chosenSub);
      const color = def.colors[Math.floor(Math.random() * def.colors.length)];
      const model = def.models[Math.floor(Math.random() * def.models.length)];
      const fuels = ['Diesel', 'Petrol', 'CNG', 'EV'];
      const fuel = def.type === 'auto' ? (Math.random() < 0.8 ? 'CNG' : 'EV') : fuels[Math.floor(Math.random() * fuels.length)];

      let x = 0, y = 0;
      const stopLine = getStopLine(laneKey);
      if (laneKey === 'NS_SB') {
        x = latCoord;
        y = customPos !== undefined ? customPos : (-def.length - 20);
      } else if (laneKey === 'NS_NB') {
        x = latCoord;
        y = customPos !== undefined ? customPos : (340 + def.length + 20);
      } else if (laneKey === 'EW_EB') {
        x = customPos !== undefined ? customPos : (-def.length - 20);
        y = getRoadY(laneKey, latCoord, x);
      } else if (laneKey === 'EW_WB') {
        x = customPos !== undefined ? customPos : (800 + def.length + 20);
        y = getRoadY(laneKey, latCoord, x);
      }

      // Turn & U-Turn Decision:
      // In left-hand drive (India), U-turns cross median to the right (median lane)
      // User requirement: Only a few U-turners, exactly 1 in 100 vehicles (0.01 probability)
      // Near-side Left turns cross under the protected green turn arrow
      let turnIntent = 'straight';
      let turnBlinker = null; // 'left' | 'right' | null
      let turnPathKey = null;

      if (def.type !== 'truck_bus' && customPos === undefined) {
        // Turn maneuvers only work on orthogonal junctions where the Bézier turn paths match the road
        const layoutType = state.currentLayout ? state.currentLayout.type : 'square_90';
        const isOrthogonalJunction = (layoutType === 'square_90' || layoutType === 'river_bridge');
        if (!isOrthogonalJunction) {
          // Non-orthogonal junctions: all vehicles go straight (turn paths would go off-road)
        } else {
        const isMedianSub = (laneKey === 'NS_SB' && chosenSub === 1) ||
                            (laneKey === 'NS_NB' && chosenSub === 0) ||
                            (laneKey === 'EW_EB' && chosenSub === 0) ||
                            (laneKey === 'EW_WB' && chosenSub === 1);
        const isCurbSub = (laneKey === 'NS_SB' && chosenSub === 0) ||
                          (laneKey === 'NS_NB' && chosenSub === 1) ||
                          (laneKey === 'EW_EB' && chosenSub === 1) ||
                          (laneKey === 'EW_WB' && chosenSub === 0);

        if (isCurbSub) {
          // Curb sublane: 18% Left Turn (blinker on), 82% Straight (no blinker)
          if (Math.random() < 0.18) {
            turnIntent = 'turn_left';
            turnBlinker = 'left';
            turnPathKey = laneKey === 'NS_SB' ? 'TURN_LEFT_NS_SB'
              : laneKey === 'NS_NB' ? 'TURN_LEFT_NS_NB'
              : laneKey === 'EW_EB' ? 'TURN_LEFT_EW_EB'
              : 'TURN_LEFT_EW_WB';
          }
        } else if (isMedianSub) {
          // Median sublane: 1% U-Turn, 12% Right Turn (blinker on), 87% Straight (no blinker)
          const r = Math.random();
          if (r < 0.01) {
            // Exactly 1 in 100 vehicles executes a U-turn across the median
            turnIntent = 'u_turn';
            turnBlinker = 'right';
            turnPathKey = laneKey === 'NS_SB' ? 'U_TURN_NS_SB'
              : laneKey === 'NS_NB' ? 'U_TURN_NS_NB'
              : laneKey === 'EW_EB' ? 'U_TURN_EW_EB'
              : 'U_TURN_EW_WB';
          } else if (r < 0.01 + 0.12) {
            // 12% execute a 90° right turn across intersection
            turnIntent = 'turn_right';
            turnBlinker = 'right';
            turnPathKey = laneKey === 'NS_SB' ? 'TURN_RIGHT_NS_SB'
              : laneKey === 'NS_NB' ? 'TURN_RIGHT_NS_NB'
              : laneKey === 'EW_EB' ? 'TURN_RIGHT_EW_EB'
              : 'TURN_RIGHT_EW_WB';
          }
        }
        } // end else isOrthogonalJunction
      }

      const initHeading = getRoadHeading(laneKey, x);

      vehicles.push({
        id: nextVehId++,
        plate: generateIndianPlate(),
        model: model,
        typeName: def.name,
        lane: laneKey,
        subLane: chosenSub,
        lateral: latCoord,
        targetLateral: latCoord,
        x: x,
        y: y,
        heading: initHeading,
        turnIntent: turnIntent,
        turnBlinker: turnBlinker,
        turnPathKey: turnPathKey,
        turnProgress: 0.0,
        turnState: 'approaching',
        isYielding: false,
        baseSpeed: def.speed * (0.92 + Math.random() * 0.16),
        currentSpeed: customPos !== undefined ? 0 : def.speed,
        length: def.length,
        width: def.width,
        type: def.type,
        canFilter: def.canFilter,
        color: color,
        pcu: def.pcu,
        fuel: fuel,
        stopLine: stopLine,
        isBraking: false,
        isOvertaking: false,
        overtakeTimer: 0,
        isFiltering: false,
        isLaneSharing: false,
        laneSharingWith: null,
        wobble: 0
      });
    }

    // Seed initial vehicles: Guarantees 2 vehicles side-by-side on EVERY lane approach adapted to active junction
    function seedInitialVehicles() {
      vehicles.length = 0;
      const stopN = getStopLine('NS_SB');
      const stopS = getStopLine('NS_NB');
      const stopW = getStopLine('EW_EB');
      const stopE = getStopLine('EW_WB');

      // Lane 1: Southbound — 2 vehicles side-by-side at stop line + 1 trailing
      spawnVehicle('NS_SB', 0, stopN - 19);
      spawnVehicle('NS_SB', 1, stopN - 19);
      spawnVehicle('NS_SB', 0, stopN - 95);

      // Lane 1: Northbound — 2 vehicles side-by-side at stop line + 1 trailing
      spawnVehicle('NS_NB', 0, stopS + 19);
      spawnVehicle('NS_NB', 1, stopS + 19);
      spawnVehicle('NS_NB', 1, stopS + 95);

      // Lane 2: Eastbound — 2 vehicles side-by-side at stop line + 1 trailing
      spawnVehicle('EW_EB', 0, stopW - 19);
      spawnVehicle('EW_EB', 1, stopW - 19);
      spawnVehicle('EW_EB', 0, stopW - 95);

      // Lane 2: Westbound — 2 vehicles side-by-side at stop line + 1 trailing
      spawnVehicle('EW_WB', 0, stopE + 19);
      spawnVehicle('EW_WB', 1, stopE + 19);
      spawnVehicle('EW_WB', 1, stopE + 95);

      // Demonstration turners only on orthogonal / square junctions to avoid awkward cuts
      const isOrthogonal = !state.currentLayout || state.currentLayout.type === 'square_90' || state.currentLayout.type === 'river_bridge';
      if (isOrthogonal && vehicles.length >= 4) {
        vehicles[0].turnIntent = 'turn_left';
        vehicles[0].turnBlinker = 'left';
        vehicles[0].turnPathKey = 'TURN_LEFT_NS_SB';

        vehicles[3].turnIntent = 'turn_right';
        vehicles[3].turnBlinker = 'right';
        vehicles[3].turnPathKey = 'TURN_RIGHT_NS_NB';
      }
    }

    // Continuous Feeder: Guarantees at least 2 vehicles per approach & balances both sub-lanes
    setInterval(() => {
      const lanes = ['NS_SB', 'NS_NB', 'EW_EB', 'EW_WB'];
      lanes.forEach(laneKey => {
        const laneVehicles = vehicles.filter(v => v.lane === laneKey && isBeforeExit(v));
        const count = laneVehicles.length;

        // Ensure both sub-lanes are occupied (count >= 2 guaranteed), capped at 4 vehicles per approach to prevent overcrowding
        const sub0Count = laneVehicles.filter(v => v.subLane === 0).length;
        const sub1Count = laneVehicles.filter(v => v.subLane === 1).length;

        if (count < 2) {
          const targetSub = sub0Count <= sub1Count ? 0 : 1;
          if (canSpawnLane(laneKey, targetSub)) spawnVehicle(laneKey, targetSub);
        } else if (count < 4 && Math.random() < 0.35 * state.densityMultiplier) {
          // Occasionally spawn a pair abreast if both sub-lanes are clear
          if (canSpawnLane(laneKey, 0) && canSpawnLane(laneKey, 1) && Math.random() < 0.25) {
            spawnVehicle(laneKey, 0);
            spawnVehicle(laneKey, 1);
          } else {
            const targetSub = sub0Count <= sub1Count ? 0 : 1;
            if (canSpawnLane(laneKey, targetSub)) spawnVehicle(laneKey, targetSub);
          }
        }
      });

      // Calculate live PCU and Queues from canvas
      const pcuNS = vehicles.filter(v => v.lane.startsWith('NS') && isBeforeExit(v)).reduce((sum, v) => sum + v.pcu, 0);
      const pcuEW = vehicles.filter(v => v.lane.startsWith('EW') && isBeforeExit(v)).reduce((sum, v) => sum + v.pcu, 0);
      const stoppedNS = vehicles.filter(v => v.lane.startsWith('NS') && isBeforeExit(v) && v.currentSpeed < 0.2).length;
      const stoppedEW = vehicles.filter(v => v.lane.startsWith('EW') && isBeforeExit(v) && v.currentSpeed < 0.2).length;

      state.pcu.NS = Math.max(1.0, Math.round(pcuNS * 10) / 10);
      state.pcu.EW = Math.max(1.0, Math.round(pcuEW * 10) / 10);
      state.totals.NS = vehicles.filter(v => v.lane.startsWith('NS') && isBeforeExit(v)).length;
      state.totals.EW = vehicles.filter(v => v.lane.startsWith('EW') && isBeforeExit(v)).length;
      state.queues.NS = Math.round(stoppedNS * 6.5);
      state.queues.EW = Math.round(stoppedEW * 6.5);
    }, 750);

    // ── Interactive Hover Telemetry Handler ──
    function initHoverTelemetry() {
      canvas.addEventListener('mousemove', (e) => {
        updateCanvasRect();
        const rect = cachedCanvasRect || canvas.getBoundingClientRect();
        const scaleX = 800 / rect.width;
        const scaleY = 340 / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        let found = null;
        let bestDist = 999;
        for (let i = vehicles.length - 1; i >= 0; i--) {
          const v = vehicles[i];
          const dist = Math.hypot(mx - v.x, my - v.y);
          const hitRadius = Math.max(30, v.length / 2 + 16);
          if (dist <= hitRadius && dist < bestDist) {
            bestDist = dist;
            found = v;
          }
        }

        hoveredVehicle = found;
        if (found) {
          canvas.style.cursor = 'pointer';
          showVehicleTooltip(found, e.clientX - rect.left, e.clientY - rect.top, rect, false);
        } else {
          canvas.style.cursor = 'default';
          if (!pinnedVehicle) hideVehicleTooltip();
        }
      });

      canvas.addEventListener('click', (e) => {
        const rect = cachedCanvasRect || canvas.getBoundingClientRect();
        const scaleX = 800 / rect.width;
        const scaleY = 340 / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        let clicked = null;
        let bestDist = 999;
        for (let i = vehicles.length - 1; i >= 0; i--) {
          const v = vehicles[i];
          const dist = Math.hypot(mx - v.x, my - v.y);
          const hitRadius = Math.max(30, v.length / 2 + 16);
          if (dist <= hitRadius && dist < bestDist) {
            bestDist = dist;
            clicked = v;
          }
        }

        if (clicked) {
          pinnedVehicle = (pinnedVehicle && pinnedVehicle.id === clicked.id) ? null : clicked;
          if (pinnedVehicle) {
            showVehicleTooltip(pinnedVehicle, e.clientX - rect.left, e.clientY - rect.top, rect, true);
          } else {
            hideVehicleTooltip();
          }
        } else {
          pinnedVehicle = null;
          hideVehicleTooltip();
        }
      });

      canvas.addEventListener('mouseleave', () => {
        hoveredVehicle = null;
        canvas.style.cursor = 'default';
        if (!pinnedVehicle) hideVehicleTooltip();
      });

      if (tooltipEl) {
        tooltipEl.addEventListener('click', (e) => {
          if (e.target && (e.target.id === 'vTipCloseBtn' || e.target.classList.contains('v-tip-close'))) {
            e.stopPropagation();
            pinnedVehicle = null;
            hideVehicleTooltip();
          }
        });
      }
    }

    // Cached state & DOM nodes to eliminate 60FPS DOM thrashing
    let currentTipVehId = null;
    let currentTipPinned = null;
    let tipDom = null;

    function renderTooltipStructure(v, isPinned) {
      const isHi = typeof I18N !== 'undefined' && I18N.CURRENT_LANG === 'hi';
      const toDigits = (val) => (typeof I18N !== 'undefined' && typeof I18N.toLocalizedDigits === 'function' ? I18N.toLocalizedDigits(val) : val);
      const t = (k, fb) => (typeof I18N !== 'undefined' && typeof I18N.t === 'function' ? I18N.t(k, fb) : fb);

      tooltipEl.innerHTML = `
        <div class="v-tip-hdr">
          <span class="v-tip-plate">${v.plate}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="v-tip-pinned-badge" id="vTipPinnedBadge" style="${isPinned ? '' : 'display:none;'}"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px;margin-right:3px;" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-2l-2-2V5h1V3H6v2h1v8l-2 2v2z"/></svg>${t('tip_pinned', 'PINNED')}</span>
            <span class="v-tip-type">${v.typeName}</span>
            <button class="v-tip-close" id="vTipCloseBtn" aria-label="Unpin" title="Close" style="${isPinned ? '' : 'display:none;'}">&times;</button>
          </div>
        </div>
        <div class="v-tip-grid">
          <span class="v-tip-k">${t('tip_model', 'Model')}:</span>
          <span class="v-tip-v" id="vTipModel">${v.model}</span>
          <span class="v-tip-k">${t('tip_speed', 'Speed')}:</span>
          <span class="v-tip-v" id="vTipSpeed" style="font-weight:700;"></span>
          <span class="v-tip-k">${t('tip_corridor', 'Corridor')}:</span>
          <span class="v-tip-v" id="vTipCorridor"></span>
          <span class="v-tip-k">${t('tip_sublane', 'Sub-Lane')}:</span>
          <span class="v-tip-v" id="vTipSubLane"></span>
          <span class="v-tip-k">${t('tip_lane_sharing', 'Lane Dynamics')}:</span>
          <span class="v-tip-v" id="vTipDynamics" style="font-weight:600;"></span>
          <span class="v-tip-k">${t('tip_turn_intent', 'Turn Intent')}:</span>
          <span class="v-tip-v" id="vTipTurnIntent" style="font-weight:600;"></span>
          <span class="v-tip-k">${t('tip_turn_blinker', 'Turn Blinker')}:</span>
          <span class="v-tip-v" id="vTipIndicator" style="font-weight:600;"></span>
          <span class="v-tip-k">${t('tip_pcu', 'PCU Weight')}:</span>
          <span class="v-tip-v">${toDigits(v.pcu)} PCU</span>
          <span class="v-tip-k">${t('tip_fuel', 'Fuel / Engine')}:</span>
          <span class="v-tip-v">${v.fuel} (BS-VI)</span>
          <span class="v-tip-k">${t('tip_vahan', 'VAHAN Check')}:</span>
          <span class="v-tip-v" style="color:#10b981;">${isHi ? 'सत्यापित ठीक है' : 'VERIFIED OK'}</span>
        </div>
        <div class="v-tip-status" id="vTipStatus"></div>
        <div id="vTipFooter" style="font-size:8.5px;text-align:center;margin-top:4px;">
          ${!isPinned ? (isHi ? '<span style="color:#64748b;">टेलीमेट्री लॉक करने हेतु वाहन पर क्लिक करें</span>' : '<span style="color:#64748b;">Click vehicle to lock telemetry</span>') : (isHi ? '<span style="color:#38bdf8;">अनलॉक करने हेतु कैनवास या क्लोज़ बटन पर क्लिक करें</span>' : '<span style="color:#38bdf8;">Click canvas or close button to unlock</span>')}
        </div>
      `;

      tipDom = {
        speed: document.getElementById('vTipSpeed'),
        corridor: document.getElementById('vTipCorridor'),
        subLane: document.getElementById('vTipSubLane'),
        dynamics: document.getElementById('vTipDynamics'),
        turnIntent: document.getElementById('vTipTurnIntent'),
        indicator: document.getElementById('vTipIndicator'),
        status: document.getElementById('vTipStatus')
      };
      currentTipVehId = v.id;
      currentTipPinned = isPinned;
    }

    function showVehicleTooltip(v, clientX, clientY, rect, isPinned = false) {
      if (!tooltipEl) return;

      tooltipEl.classList.toggle('pinned', isPinned);

      if (v.id !== currentTipVehId || isPinned !== currentTipPinned || !tipDom) {
        renderTooltipStructure(v, isPinned);
      }

      const isHi = typeof I18N !== 'undefined' && I18N.CURRENT_LANG === 'hi';
      const toDigits = (val) => (typeof I18N !== 'undefined' && typeof I18N.toLocalizedDigits === 'function' ? I18N.toLocalizedDigits(val) : val);

      const speedKmH = Math.round(v.currentSpeed * 18);
      const isStopped = v.currentSpeed < 0.2;
      let statusClass = 'cruising';
      let statusText = isHi ? 'सामान्य प्रवाह / क्रूजिंग' : 'CRUISING / NORMAL FLOW';

      if (v.turnState === 'turning') {
        statusClass = 'filtering';
        statusText = v.turnIntent === 'u_turn' ? (isHi ? 'मीडियन पार यू-टर्न जारी' : 'EXECUTING U-TURN ACROSS MEDIAN') : (v.turnIntent === 'turn_right' ? (isHi ? '९०° दायाँ मोड़ जारी' : 'EXECUTING 90° RIGHT TURN') : (isHi ? '९०° बायाँ मोड़ जारी' : 'EXECUTING 90° LEFT TURN'));
      } else if (v.isYielding) {
        statusClass = 'braking';
        statusText = isHi ? 'विपरीत यातायात हेतु प्रतीक्षारत' : 'YIELDING FOR OPPOSING TRAFFIC (AT TURN)';
      } else if (v.isOvertaking) {
        statusClass = 'overtaking';
        statusText = isHi ? 'धीमे वाहन से आगे निकल रहा है' : 'OVERTAKING SLOWER VEHICLE';
      } else if (isStopped) {
        statusClass = 'braking';
        statusText = isHi ? 'सिग्नल पर कतारबद्ध (रुका हुआ)' : 'QUEUED AT SIGNAL (STOPPED)';
      } else if (v.isBraking) {
        statusClass = 'braking';
        statusText = isHi ? 'गति धीमी / ब्रेक लगा रहा है' : 'DECELERATING / BRAKING';
      } else if (v.isFiltering) {
        statusClass = 'filtering';
        statusText = isHi ? 'स्टॉपलाइन की ओर लेन फ़िल्टरिंग' : 'LANE FILTERING TO STOPLINE';
      }

      const laneName = isHi
        ? (v.lane === 'NS_SB' ? 'लेन १ (उत्तर → दक्षिण)'
          : v.lane === 'NS_NB' ? 'लेन १ (दक्षिण → उत्तर)'
          : v.lane === 'EW_EB' ? 'लेन २ (पश्चिम → पूर्व)'
          : 'लेन २ (पूर्व → पश्चिम)')
        : (v.lane === 'NS_SB' ? 'Lane 1 (North → South)'
          : v.lane === 'NS_NB' ? 'Lane 1 (South → North)'
          : v.lane === 'EW_EB' ? 'Lane 2 (West → East)'
          : 'Lane 2 (East → West)');

      const subLaneLabel = isHi
        ? (v.subLane === 0 ? 'आंतरिक ट्रैक' : 'बाहरी ट्रैक')
        : (v.subLane === 0 ? 'Inner Track' : 'Outer Track');

      const turnIntentLabel = isHi
        ? (v.turnIntent === 'turn_left' ? 'बायाँ मोड़'
          : v.turnIntent === 'turn_right' ? 'दायाँ मोड़'
          : v.turnIntent === 'u_turn' ? 'यू-टर्न'
          : 'सीधा')
        : (v.turnIntent === 'turn_left' ? 'Turn Left'
          : v.turnIntent === 'turn_right' ? 'Turn Right'
          : v.turnIntent === 'u_turn' ? 'U-Turn'
          : 'Straight');

      const blinkerLabel = isHi
        ? (v.turnBlinker === 'left' ? 'बायाँ ब्लिंकर (पीला)'
          : v.turnBlinker === 'right' ? 'दायाँ ब्लिंकर (पीला)'
          : 'कोई नहीं (सीधा)')
        : (v.turnBlinker === 'left' ? 'Left Blinker (Amber)'
          : v.turnBlinker === 'right' ? 'Right Blinker (Amber)'
          : 'None (Straight)');

      // Direct in-place updates without DOM destruction
      if (tipDom.speed) {
        tipDom.speed.textContent = isHi ? `${toDigits(speedKmH)} किमी/घं` : `${speedKmH} km/h`;
        tipDom.speed.style.color = isStopped ? '#ef4444' : '#10b981';
      }
      if (tipDom.corridor) {
        tipDom.corridor.textContent = laneName;
      }
      if (tipDom.subLane) {
        tipDom.subLane.textContent = subLaneLabel;
      }
      if (tipDom.dynamics) {
        tipDom.dynamics.textContent = v.isLaneSharing
          ? (isHi ? `समानांतर [${v.laneSharingWith}]` : `Abreast [${v.laneSharingWith}]`)
          : (v.subLane === 0 ? (isHi ? 'बायाँ उप-ट्रैक' : 'Left Sub-Track') : (isHi ? 'दायाँ उप-ट्रैक' : 'Right Sub-Track'));
        tipDom.dynamics.style.color = v.isLaneSharing ? '#38bdf8' : '#cbd5e1';
      }
      if (tipDom.turnIntent) {
        tipDom.turnIntent.textContent = turnIntentLabel;
        tipDom.turnIntent.style.color = v.turnIntent === 'straight' ? '#94a3b8' : '#38bdf8';
      }
      if (tipDom.indicator) {
        tipDom.indicator.textContent = blinkerLabel;
        tipDom.indicator.style.color = v.turnBlinker ? '#fbbf24' : '#94a3b8';
      }
      if (tipDom.status) {
        tipDom.status.className = `v-tip-status ${statusClass}`;
        tipDom.status.textContent = statusText;
      }

      const rWidth = rect ? rect.width : 800;
      const rHeight = rect ? rect.height : 340;
      let tipLeft = clientX + 16;
      let tipTop = clientY - 10;
      if (tipLeft + 235 > rWidth) tipLeft = clientX - 245;
      if (tipTop + 195 > rHeight) tipTop = rHeight - 200;
      if (tipTop < 10) tipTop = 10;

      tooltipEl.style.left = tipLeft + 'px';
      tooltipEl.style.top = tipTop + 'px';
      tooltipEl.classList.remove('hidden');
    }

    function hideVehicleTooltip() {
      currentTipVehId = null;
      currentTipPinned = null;
      if (tooltipEl) {
        tooltipEl.classList.add('hidden');
        tooltipEl.classList.remove('pinned');
      }
    }

    // ── 60FPS Physics Animation Loop (Overtaking, Gap Management & Reticle) ──
    function renderLoop() {
      ctx.clearRect(0, 0, 800, 340);

      const isAllRed = state.lightState === 'ALL_RED';
      const sigNS = isAllRed ? 'RED' : (state.activeCorridor === 'NS' ? state.lightState : 'RED');
      const sigEW = isAllRed ? 'RED' : (state.activeCorridor === 'EW' ? state.lightState : 'RED');

      // Independent Left & Right Turn Arrow Signals for Protected Turning / Crossing Traffic
      const arrowL_NS = isAllRed ? 'OFF' : (state.activeCorridor === 'NS' ? state.arrowL : 'OFF');
      const arrowR_NS = isAllRed ? 'OFF' : (state.activeCorridor === 'NS' ? state.arrowR : 'OFF');
      const arrowL_EW = isAllRed ? 'OFF' : (state.activeCorridor === 'EW' ? state.arrowL : 'OFF');
      const arrowR_EW = isAllRed ? 'OFF' : (state.activeCorridor === 'EW' ? state.arrowR : 'OFF');

      const MIN_GAP = 28;  // Hard bumper-to-bumper gap (px) for organized, clean spacing
      const SLOW_GAP = 85; // Deceleration onset gap (px)
      const jz = getJunctionZone(); // Per-layout junction zone bounds

      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];
        const isNSLane = v.lane.startsWith('NS');
        const throughSig = isNSLane ? sigNS : sigEW;
        const arrowL_Sig = isNSLane ? arrowL_NS : arrowL_EW;
        const arrowR_Sig = isNSLane ? arrowR_NS : arrowR_EW;

        // 1. Distance to Stop Line
        const stopLinePos = getStopLine(v.lane);
        let distToStop = 999;
        if (v.lane === 'NS_SB') distToStop = stopLinePos - (v.y + v.length / 2);
        else if (v.lane === 'NS_NB') distToStop = (v.y - v.length / 2) - stopLinePos;
        else if (v.lane === 'EW_EB') distToStop = stopLinePos - (v.x + v.length / 2);
        else if (v.lane === 'EW_WB') distToStop = (v.x - v.length / 2) - stopLinePos;

        // In-Junction Geometry Awareness: once past the stopline, vehicle MUST clear out
        const isPastStopLine = distToStop <= 0;
        const inJunctionZone = (v.x >= jz.xMin && v.x <= jz.xMax && v.y >= jz.yMin && v.y <= jz.yMax);

        // 2. Find closest vehicle directly ahead in same lane & check lateral conflicts
        let leadGap = 999;
        let leadVeh = null;

        for (let j = 0; j < vehicles.length; j++) {
          if (i === j) continue;
          const other = vehicles[j];
          if (other.lane !== v.lane) continue;

          const latDiff = Math.abs(other.lateral - v.lateral);
          const latConflict = latDiff < ((v.width + other.width) / 2 + 5);
          if (other.subLane !== v.subLane && !latConflict) continue;

          let gap = -1;
          if (v.lane === 'NS_SB' && other.y > v.y) {
            gap = (other.y - other.length / 2) - (v.y + v.length / 2);
          } else if (v.lane === 'NS_NB' && other.y < v.y) {
            gap = (v.y - v.length / 2) - (other.y + other.length / 2);
          } else if (v.lane === 'EW_EB' && other.x > v.x) {
            gap = (other.x - other.length / 2) - (v.x + v.length / 2);
          } else if (v.lane === 'EW_WB' && other.x < v.x) {
            gap = (v.x - v.length / 2) - (other.x + other.length / 2);
          }

          if (gap >= 0 && gap < leadGap) {
            leadGap = gap;
            leadVeh = other;
          }
        }

        // 3. Indian Road Overtaking Mechanism: Slower tempos/trucks are overtaken by cars/bikes/autos
        if (v.overtakeTimer > 0) v.overtakeTimer--;
        if (leadVeh && !v.isOvertaking && v.overtakeTimer === 0 && distToStop > 45 && v.turnState !== 'turning' && !inJunctionZone) {
          const isLeadSlow = leadVeh.currentSpeed < v.baseSpeed * 0.85 || leadVeh.type === 'tempo' || leadVeh.type === 'truck_bus' || leadVeh.isBraking;
          const isFaster = v.baseSpeed > leadVeh.baseSpeed * 1.05 || v.type === 'bike' || v.type === 'auto' || v.type === 'car';

          if (isLeadSlow && isFaster && leadGap < 70 && leadGap > 18) {
            const targetSub = 1 - v.subLane;
            // Ensure target sub-lane has a safe generous opening
            const isTargetClear = !vehicles.some(o => {
              if (o.id === v.id || o.lane !== v.lane) return false;
              const isTargetSub = (o.subLane === targetSub || Math.abs(o.lateral - getSubLaneCoord(v.lane, targetSub)) < 12);
              if (!isTargetSub) return false;
              let dist = 999;
              if (v.lane === 'NS_SB' || v.lane === 'NS_NB') dist = Math.abs(o.y - v.y);
              else dist = Math.abs(o.x - v.x);
              return dist < (v.length / 2 + o.length / 2 + 40);
            });

            if (isTargetClear) {
              v.isOvertaking = true;
              v.subLane = targetSub;
              v.targetLateral = getSubLaneCoord(v.lane, targetSub);
              v.overtakeTimer = 90;
            }
          }
        }

        // 4. Bike & Auto Lane Filtering at Red Signal Stopline (Classic Indian Traffic)
        if (v.canFilter && throughSig === 'RED' && distToStop > 16 && leadVeh && leadVeh.currentSpeed < 0.2 && v.turnState !== 'turning' && !inJunctionZone) {
          if (leadGap < 30 && !v.isFiltering) {
            const targetSub = 1 - v.subLane;
            const isEdgeClear = !vehicles.some(o => {
              if (o.lane !== v.lane || o.subLane !== targetSub) return false;
              const dist = v.lane.startsWith('NS') ? Math.abs(o.y - v.y) : Math.abs(o.x - v.x);
              return dist < 26;
            });
            if (isEdgeClear) {
              v.isFiltering = true;
              v.subLane = targetSub;
              v.targetLateral = getSubLaneCoord(v.lane, targetSub);
            }
          }
        }

        let targetSpeed = v.baseSpeed;
        v.isBraking = false;

        // 5. Follow Lead Vehicle (Only stops vehicles BEFORE the junction; inside junction maintain clearance)
        if (leadVeh) {
          if (leadGap <= MIN_GAP) {
            if (inJunctionZone || isPastStopLine) {
              // Inside junction: NEVER freeze to 0! Match lead speed with positive clearance floor
              targetSpeed = Math.max(1.3, leadVeh.currentSpeed);
            } else {
              targetSpeed = 0;
              v.currentSpeed = 0;
              v.isBraking = true;
              if (v.lane === 'NS_SB') v.y = Math.min(v.y, leadVeh.y - leadVeh.length / 2 - v.length / 2 - MIN_GAP);
              else if (v.lane === 'NS_NB') v.y = Math.max(v.y, leadVeh.y + leadVeh.length / 2 + v.length / 2 + MIN_GAP);
              else if (v.lane === 'EW_EB') v.x = Math.min(v.x, leadVeh.x - leadVeh.length / 2 - v.length / 2 - MIN_GAP);
              else if (v.lane === 'EW_WB') v.x = Math.max(v.x, leadVeh.x + leadVeh.length / 2 + v.length / 2 + MIN_GAP);
            }
          } else if (leadGap < SLOW_GAP) {
            const factor = (leadGap - MIN_GAP) / (SLOW_GAP - MIN_GAP);
            targetSpeed = Math.min(v.baseSpeed, leadVeh.currentSpeed + (v.baseSpeed - leadVeh.currentSpeed) * (factor * factor));
            v.isBraking = true;
          }
        }

        // 6. Signal Stop Line Constraint (Clean Hard Stops ONLY BEFORE crossing the stopline)
        // STRICT USER REQUIREMENT: When the left/right light is on, ONLY vehicles with their blinkers on will turn!
 // - Vehicles with turnBlinker 'left' are governed ONLY by arrowL 'GREEN'
 // - Vehicles with turnBlinker 'right' are governed ONLY by arrowR 'GREEN'
        // - Vehicles without blinker (Straight) are governed ONLY by through circular signal (never enter on turn arrows!)
        if (!isPastStopLine && !inJunctionZone && v.turnState !== 'turning') {
          let activeSig = 'RED';
          if (v.turnBlinker === 'left') {
            activeSig = arrowL_Sig === 'GREEN' ? 'GREEN' : 'RED';
          } else if (v.turnBlinker === 'right') {
            activeSig = arrowR_Sig === 'GREEN' ? 'GREEN' : 'RED';
          } else {
            // Straight vehicles without turn blinkers are governed strictly by the through signal!
            activeSig = throughSig;
          }

          if (activeSig === 'RED') {
            if (distToStop > 0 && distToStop < 70) {
              if (distToStop <= 4) {
                targetSpeed = 0;
                v.currentSpeed = 0;
                v.isBraking = true;
                if (v.lane === 'NS_SB') v.y = stopLinePos - v.length / 2 - 2;
                else if (v.lane === 'NS_NB') v.y = stopLinePos + v.length / 2 + 2;
                else if (v.lane === 'EW_EB') v.x = stopLinePos - v.length / 2 - 2;
                else if (v.lane === 'EW_WB') v.x = stopLinePos + v.length / 2 + 2;
              } else {
                const factor = distToStop / 70;
                targetSpeed = Math.min(targetSpeed, v.baseSpeed * (factor * factor));
                v.isBraking = true;
              }
            }
          } else if (activeSig === 'AMBER') {
            if (distToStop > 25) {
              const factor = Math.max(0, distToStop / 70);
              targetSpeed = Math.min(targetSpeed, v.baseSpeed * (factor * factor));
              v.isBraking = true;
            }
          }
        } else {
          // Inside junction / clearing box: guarantee positive clearing momentum!
          // NEVER stop in the middle of the junction box!
          targetSpeed = Math.max(targetSpeed, v.baseSpeed * 0.95, 1.6);
        }

        // 7. Abreast Lane-Sharing Coordination (2 vehicles per lane side-by-side)
        v.isLaneSharing = false;
        v.laneSharingWith = null;
        for (let k = 0; k < vehicles.length; k++) {
          if (k === i) continue;
          const o = vehicles[k];
          if (o.lane === v.lane && o.subLane !== v.subLane) {
            const longDist = (v.lane.startsWith('NS')) ? Math.abs(v.y - o.y) : Math.abs(v.x - o.x);
            if (longDist < 24) {
              v.isLaneSharing = true;
              v.laneSharingWith = o.plate;
              // Synchronize cruise speeds so they proceed side-by-side smoothly
              if (!v.isBraking && !o.isBraking && throughSig === 'GREEN' && v.turnState !== 'turning' && o.turnState !== 'turning') {
                targetSpeed = (targetSpeed + o.currentSpeed) / 2;
              }
              break;
            }
          }
        }

        // 8. Velocity update: Clean deceleration & absolute zero jitter when stopped
        if (targetSpeed === 0) {
          if (v.currentSpeed < 0.15 || distToStop <= 4) {
            v.currentSpeed = 0;
          } else {
            v.currentSpeed += (0 - v.currentSpeed) * 0.35;
          }
        } else if (targetSpeed < v.currentSpeed) {
          v.currentSpeed += (targetSpeed - v.currentSpeed) * 0.35;
          if (v.currentSpeed < 0.04 && !isPastStopLine && !inJunctionZone) v.currentSpeed = 0;
        } else {
          v.currentSpeed += (targetSpeed - v.currentSpeed) * 0.12;
        }

        // 9. Definitive Turning Execution on Invisible Parametric Splines
        const path = (v.turnPathKey && DEFINITIVE_TURN_PATHS[v.turnPathKey]) ? DEFINITIVE_TURN_PATHS[v.turnPathKey] : null;

        if (path && v.turnState !== 'completed') {
          // As soon as turning vehicle crosses stop line towards junction, begin spline traversal
          if (v.turnState === 'approaching' && isPastStopLine) {
            v.turnState = 'turning';
            v.turnProgress = 0.0;
            v.isYielding = false;
          }

          if (v.turnState === 'turning') {
            // Check if another vehicle is ahead on the same curve
            let leadOnCurveSpeed = null;
            for (let k = 0; k < vehicles.length; k++) {
              if (k === i) continue;
              const o = vehicles[k];
              if (o.turnPathKey === v.turnPathKey && o.turnState === 'turning') {
                if (o.turnProgress > v.turnProgress) {
                  const distOnCurve = (o.turnProgress - v.turnProgress) * path.length;
                  if (distOnCurve < ((v.length + o.length) / 2 + 16)) {
                    leadOnCurveSpeed = o.currentSpeed;
                    break;
                  }
                }
              }
            }

            if (leadOnCurveSpeed !== null) {
              v.currentSpeed = Math.min(v.currentSpeed, Math.max(1.1, leadOnCurveSpeed));
            } else {
              // Positive clearing speed along the invisible rail (never stops in junction!)
              v.currentSpeed = Math.max(v.currentSpeed, 1.5);
            }

            v.turnProgress += (v.currentSpeed / path.length);

            if (v.turnProgress >= 1.0) {
              // Turn completed cleanly into target corridor
              v.turnProgress = 1.0;
              v.turnState = 'completed';
              v.turnBlinker = null;
              v.turnIntent = 'straight';
              v.lane = path.targetLane;
              v.subLane = path.targetSubLane;
              v.lateral = path.targetLateral;
              v.targetLateral = path.targetLateral;
              v.x = path.p3.x;
              v.y = path.p3.y;
              v.heading = path.targetHeading;
            } else {
              // Locked 100% to the Cubic Bézier spline
              const pt = evalCubicBezier(path.p0, path.p1, path.p2, path.p3, v.turnProgress);
              v.x = pt.x;
              v.y = pt.y;
              v.heading = pt.heading;
            }
          }
        }

        // 10. Normal straight path lateral interpolation & advancement
        if (v.turnState !== 'turning') {
          if (Math.abs(v.targetLateral - v.lateral) > 0.05) {
            v.lateral += (v.targetLateral - v.lateral) * 0.12;
          } else {
            v.lateral = v.targetLateral;
          }
          // Zero wobble when stopped or slow: eliminates front vehicle vibration and jitter!
          v.wobble = (v.currentSpeed > 0.4) ? Math.sin(Date.now() / 420 + v.id * 2.3) * 0.4 : 0;

          if (v.lane === 'NS_SB' || v.lane === 'NS_NB') {
            v.x = v.lateral + v.wobble;
          } else {
            v.y = getRoadY(v.lane, v.lateral, v.x) + v.wobble;
          }

          if (v.currentSpeed > 0.001) {
            if (v.lane === 'NS_SB') {
              v.y += v.currentSpeed;
            } else if (v.lane === 'NS_NB') {
              v.y -= v.currentSpeed;
            } else if (v.lane === 'EW_EB') {
              v.x += v.currentSpeed;
            } else if (v.lane === 'EW_WB') {
              v.x -= v.currentSpeed;
            }
          }

          // STRICT STRAIGHT ALIGNMENT: Unconditionally match vehicle heading to road geometry
          // Fixes tilted/crooked vehicles whether cruising, decelerating, or stopped at signals!
          v.heading = getRoadHeading(v.lane, v.x);
        }

        // Clear overtaking state once safely ahead
        if (v.isOvertaking && Math.abs(v.lateral - v.targetLateral) < 1.0) {
          if (leadVeh) {
            let isPast = false;
            if (v.lane === 'NS_SB') isPast = v.y > leadVeh.y + leadVeh.length / 2 + 18;
            else if (v.lane === 'NS_NB') isPast = v.y < leadVeh.y - leadVeh.length / 2 - 18;
            else if (v.lane === 'EW_EB') isPast = v.x > leadVeh.x + leadVeh.length / 2 + 18;
            else if (v.lane === 'EW_WB') isPast = v.x < leadVeh.x - leadVeh.length / 2 - 18;
            if (isPast) v.isOvertaking = false;
          } else {
            v.isOvertaking = false;
          }
        }
      }

      // ── UNIVERSAL 2D MULTI-BODY SEPARATION SOLVER ──
      // Evaluates vehicle pairs to prevent visual overlap while strictly preventing stopline vibration/jitter
      for (let i = 0; i < vehicles.length; i++) {
        const vi = vehicles[i];
        for (let j = i + 1; j < vehicles.length; j++) {
          const vj = vehicles[j];

          // 1. Both vehicles stopped at signal / in queue: stationary vehicles never push each other!
          if (vi.currentSpeed < 0.02 && vj.currentSpeed < 0.02) continue;

          // 2. Same lane, different sub-lanes (2 vehicles per lane side-by-side):
          // They run on parallel sub-tracks 22px apart. Only separate if lateral distance is dangerously close
          if (vi.lane === vj.lane && vi.subLane !== vj.subLane && vi.turnState !== 'turning' && vj.turnState !== 'turning') {
            const latDiff = (vi.lane.startsWith('NS')) ? Math.abs(vj.x - vi.x) : Math.abs(vj.y - vi.y);
            const longDiff = (vi.lane.startsWith('NS')) ? Math.abs(vj.y - vi.y) : Math.abs(vj.x - vi.x);
            // If they maintain their separate sub-lane lateral tracks (>14px), they are safely abreast!
            if (latDiff >= 14 || longDiff > ((vi.length + vj.length) / 2 + 6)) continue;
          }

          const dx = vj.x - vi.x;
          const dy = vj.y - vi.y;
          const distSq = dx * dx + dy * dy;
          const minReqDist = (vi.length + vj.length) * 0.40 + 6;
          if (distSq < minReqDist * minReqDist) {
            const dist = Math.sqrt(distSq) || 0.001;
            const overlap = minReqDist - dist;

            const inJunction = (vi.x >= jz.xMin && vi.x <= jz.xMax && vi.y >= jz.yMin && vi.y <= jz.yMax) ||
                               (vj.x >= jz.xMin && vj.x <= jz.xMax && vj.y >= jz.yMin && vj.y <= jz.yMax);

            const nx = dx / dist;
            const ny = dy / dist;

            if (inJunction) {
              // Inside junction: separate laterally and preserve clearing speed
              vj.x += nx * overlap * 0.5;
              vj.y += ny * overlap * 0.5;
              vi.x -= nx * overlap * 0.5;
              vi.y -= ny * overlap * 0.5;
              vi.currentSpeed = Math.max(vi.currentSpeed, 1.4);
              vj.currentSpeed = Math.max(vj.currentSpeed, 1.4);
            } else {
              // Outside junction: slow/stop trailing vehicle without creating position jitter
              let trailing = (vj.currentSpeed >= vi.currentSpeed) ? vj : vi;
              trailing.currentSpeed = 0;
              trailing.isBraking = true;
              // Only apply soft push if actually moving, never jitter stationary vehicles
              if (trailing.currentSpeed > 0.05) {
                if (trailing === vj) {
                  vj.x += nx * overlap * 0.25;
                  vj.y += ny * overlap * 0.25;
                } else {
                  vi.x -= nx * overlap * 0.25;
                  vi.y -= ny * overlap * 0.25;
                }
              }
            }
          }
        }
      }

      // 12. Remove offscreen vehicles
      for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        if (v.y > 380 || v.y < -50 || v.x > 850 || v.x < -50) {
          vehicles.splice(i, 1);
        }
      }

      // 13. Render Authentic Pune Vehicles & Tactical Reticle on Canvas
      for (let i = 0; i < vehicles.length; i++) {
        const v = vehicles[i];

        // Canvas Offscreen Culling: skip detailed canvas drawing outside viewport bounds
        if (v.x < -20 || v.x > 820 || v.y < -20 || v.y > 360) {
          continue;
        }

        ctx.save();
        ctx.translate(v.x, v.y);

        const heading = (v.heading !== undefined) ? v.heading : (v.lane === 'NS_SB' ? Math.PI / 2 : v.lane === 'NS_NB' ? -Math.PI / 2 : v.lane === 'EW_EB' ? 0 : Math.PI);
        ctx.rotate(heading);

        const isStoppedOrBraking = v.isBraking || v.currentSpeed < 0.2;

        // ── AUTHENTIC VEHICLE RENDERING ROUTINES ──
        const len = v.length;
        const wid = v.width;

        // Common Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.beginPath();
        ctx.roundRect(-len / 2, -wid / 2 + 1.5, len, wid, 3);
        ctx.fill();

        if (v.type === 'truck_bus') {
          // ── 1. PMPML BUS (Pune City Transit) ──
          // Base white body
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2, len, wid, 4);
          ctx.fill();

          // PMPML Green Livery Stripe (lower half & front accent)
          ctx.fillStyle = '#15803d';
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2 + 3, len, wid - 6, 2);
          ctx.fill();

          // White upper window cabin band
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(-len / 2.2, -wid / 2 + 2, len * 0.85, wid - 4, 2);
          ctx.fill();

          // Dark tinted passenger windows
          ctx.fillStyle = '#0f172a';
          for (let wx = -len / 2.4; wx < len / 3; wx += 5.5) {
            ctx.fillRect(wx, -wid / 2 + 3, 4.2, wid - 6);
          }

          // LED Destination Board at Front ("PMPML • PUNE")
          ctx.fillStyle = '#020617';
          ctx.fillRect(len / 2 - 6, -wid / 3, 5, wid * 0.6);
          ctx.fillStyle = '#fbbf24'; // Amber LED text glow
          ctx.font = 'bold 5px sans-serif';
          ctx.textAlign = 'center';
          ctx.save();
          ctx.translate(len / 2 - 3.5, 0);
          ctx.rotate(Math.PI / 2);
          ctx.fillText('PMPML', 0, 1.5);
          ctx.restore();

          // Front Windshield
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(len / 4, -wid / 2 + 1.5, len / 6, wid - 3, 2);
          ctx.fill();

          // Roof AC Unit & Emergency Hatches
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.roundRect(-len / 6, -wid / 3, len / 3, wid * 0.6, 2);
          ctx.fill();
          ctx.fillStyle = '#94a3b8';
          ctx.fillRect(-len / 3, -wid / 4, 3, 2);
          ctx.fillRect(len / 8, -wid / 4, 3, 2);

          // Side Mirrors
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(len / 4, -wid / 2 - 2, 3, 2);
          ctx.fillRect(len / 4, wid / 2, 3, 2);

          // Dual Rear Axles (Wheels)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-len / 3, -wid / 2 - 2, 4, 2);
          ctx.fillRect(-len / 3, wid / 2, 4, 2);
          ctx.fillRect(-len / 3 - 5, -wid / 2 - 2, 4, 2);
          ctx.fillRect(-len / 3 - 5, wid / 2, 4, 2);

        } else if (v.type === 'auto') {
          // ── 2. AUTO-RICKSHAW (Pune Bajaj RE / Piaggio CNG) ──
          // Yellow canopy roof
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.roundRect(-len / 2.5, -wid / 2, len * 0.8, wid, 4);
          ctx.fill();

          // Dark green body lower structure
          ctx.fillStyle = '#14532d';
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2.2, len * 0.9, wid * 0.8, 3);
          ctx.fill();

          // Open passenger compartment sides (dark interior seats)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-len / 4, -wid / 2.5, len / 2.5, wid * 0.7);

          // Front Handlebar & Windshield
          ctx.fillStyle = '#334155';
          ctx.fillRect(len / 3, -wid / 3, 2, wid * 0.6);
          ctx.fillStyle = '#020617';
          ctx.beginPath();
          ctx.roundRect(len / 4, -wid / 2.5, len / 6, wid * 0.8, 2);
          ctx.fill();

          // CNG Green Badge on side
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(-len / 6, -wid / 2.2, 3, 2);

        } else if (v.type === 'bike') {
          // ── 3. MOTORCYCLE / SCOOTER (Two-Wheeler with Rider Helmet) ──
          // Bike body / spine
          ctx.fillStyle = v.color;
          ctx.beginPath();
          ctx.roundRect(-len / 2.2, -wid / 3, len * 0.85, wid * 0.6, 2);
          ctx.fill();

          // Wheels (Front and Rear)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(len / 2 - 2, -wid / 2, 3, wid);
          ctx.fillRect(-len / 2, -wid / 2, 3, wid);

          // Rider Helmet (bright yellow/white circle in center)
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(0, 0, wid * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#eab308'; // Helmet visor / accent
          ctx.beginPath();
          ctx.arc(2, 0, wid * 0.25, 0, Math.PI * 2);
          ctx.fill();

          // Handlebars & Mirror stalks
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(len / 3, -wid / 2 - 1);
          ctx.lineTo(len / 3, wid / 2 + 1);
          ctx.stroke();

        } else if (v.type === 'tempo') {
          // ── 4. TATA ACE CHHOTA HATHI (Light Commercial Tempo / Mini-Truck) ──
          // Cargo Flatbed (Rear half)
          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2, len / 2, wid, 2);
          ctx.fill();
          ctx.fillStyle = '#334155';
          ctx.strokeRect(-len / 2, -wid / 2, len / 2, wid);

          // Front Cab (Front half)
          ctx.fillStyle = v.color || '#f8fafc';
          ctx.beginPath();
          ctx.roundRect(0, -wid / 2, len / 2, wid, 3);
          ctx.fill();

          // Windshield
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(len / 6, -wid / 2.2, len / 6, wid * 0.8, 2);
          ctx.fill();

          // Side Mirrors
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(len / 4, -wid / 2 - 2, 2.5, 2);
          ctx.fillRect(len / 4, wid / 2, 2.5, 2);

          // Dual axles / wheels
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-len / 3, -wid / 2 - 1.5, 4, 2);
          ctx.fillRect(-len / 3, wid / 2 - 0.5, 4, 2);
          ctx.fillRect(len / 3, -wid / 2 - 1.5, 4, 2);
          ctx.fillRect(len / 3, wid / 2 - 0.5, 4, 2);

        } else {
          // ── 5. MODERN PASSENGER CAR / SUV ──
          ctx.fillStyle = v.color;
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2, len, wid, 3.5);
          ctx.fill();

          // Roof contour / cabin center
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(-len / 4.5, -wid / 2.3, len / 2.2, wid * 0.82, 2.5);
          ctx.fill();

          // Windshields (Front & Rear angled glass)
          ctx.fillStyle = 'rgba(10, 15, 26, 0.85)';
          ctx.fillRect(len / 6, -wid / 2.4, len / 8, wid * 0.8);
          ctx.fillRect(-len / 3.5, -wid / 2.4, len / 10, wid * 0.8);

          // Side Mirrors
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(len / 6, -wid / 2 - 2, 2.5, 2);
          ctx.fillRect(len / 6, wid / 2, 2.5, 2);
        }

        // Headlights (Warm white forward beam)
        ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
        ctx.fillRect(len / 2 - 2, -wid / 2 + 1, 2, 2.5);
        ctx.fillRect(len / 2 - 2, wid / 2 - 3.5, 2, 2.5);

        // Taillights / Brake lights
        if (isStoppedOrBraking) {
          ctx.fillStyle = '#ef4444';
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 8;
          ctx.fillRect(-len / 2, -wid / 2 + 1, 2.5, 3);
          ctx.fillRect(-len / 2, wid / 2 - 4, 2.5, 3);
        } else {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.shadowBlur = 0;
          ctx.fillRect(-len / 2, -wid / 2 + 1, 2, 2.5);
          ctx.fillRect(-len / 2, wid / 2 - 3.5, 2, 2.5);
        }

        // ── Amber Turn Indicator Lamp Housings & Flashing Blinker (2Hz flash rate) ──
        const blinkOn = v.turnBlinker && (Math.floor(Date.now() / 250) % 2 === 0);
        const amberColor = '#fbbf24';
        const dimAmber = 'rgba(245, 158, 11, 0.25)';

        const indicatorCorners = [
          { x: len / 2 - 1, y: -wid / 2, side: 'left' },
          { x: len / 2 - 1, y: wid / 2, side: 'right' },
          { x: -len / 2 + 1, y: -wid / 2, side: 'left' },
          { x: -len / 2 + 1, y: wid / 2, side: 'right' }
        ];

        indicatorCorners.forEach(c => {
          const isActiveBlinker = v.turnBlinker === c.side;
          ctx.save();
          if (isActiveBlinker && blinkOn) {
            ctx.fillStyle = amberColor;
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = dimAmber;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });

        // ══ TACTICAL HOVER / PIN RETICLE ON CANVAS ══
        const isHovered = hoveredVehicle && hoveredVehicle.id === v.id;
        const isPinned = pinnedVehicle && pinnedVehicle.id === v.id;
        if (isHovered || isPinned) {
          ctx.save();
          ctx.strokeStyle = isPinned ? '#38bdf8' : '#60a5fa';
          ctx.lineWidth = isPinned ? 2 : 1.5;

          const bPad = 7;
          const bW = v.length + bPad * 2;
          const bH = v.width + bPad * 2;
          const cLen = 6;

          // Corner Reticles ⌜ ⌝ ⌞ ⌟
          ctx.beginPath();
          // Top-left
          ctx.moveTo(-bW / 2, -bH / 2 + cLen);
          ctx.lineTo(-bW / 2, -bH / 2);
          ctx.lineTo(-bW / 2 + cLen, -bH / 2);
          // Top-right
          ctx.moveTo(bW / 2 - cLen, -bH / 2);
          ctx.lineTo(bW / 2, -bH / 2);
          ctx.lineTo(bW / 2, -bH / 2 + cLen);
          // Bottom-left
          ctx.moveTo(-bW / 2, bH / 2 - cLen);
          ctx.lineTo(-bW / 2, bH / 2);
          ctx.lineTo(-bW / 2 + cLen, bH / 2);
          // Bottom-right
          ctx.moveTo(bW / 2 - cLen, bH / 2);
          ctx.lineTo(bW / 2, bH / 2);
          ctx.lineTo(bW / 2, bH / 2 - cLen);
          ctx.stroke();

          // Floating License Plate Badge on Canvas (keeps horizontal text)
          ctx.rotate(-heading);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
          ctx.strokeStyle = isPinned ? '#38bdf8' : '#3b82f6';
          ctx.lineWidth = 1;
          const tagWidth = isPinned ? 114 : 88;
          ctx.beginPath();
          ctx.roundRect(-tagWidth / 2, -v.length / 2 - 24, tagWidth, 17, 3);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isPinned ? '#38bdf8' : '#fbbf24';
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText((isPinned ? 'LOCK • ' : '') + v.plate, 0, -v.length / 2 - 12);

          ctx.restore();
        }

        ctx.restore();
      }

      // Continuous 60FPS Tracking for Active Tooltip
      const activeTrack = pinnedVehicle || hoveredVehicle;
      if (activeTrack) {
        const freshV = vehicles.find(veh => veh.id === activeTrack.id);
        if (freshV) {
          const rect = cachedCanvasRect || (canvas ? (cachedCanvasRect = canvas.getBoundingClientRect()) : null);
          if (rect && rect.width && rect.height) {
            const scaleX = rect.width / 800;
            const scaleY = rect.height / 340;
            const sx = freshV.x * scaleX;
            const sy = freshV.y * scaleY;
            showVehicleTooltip(freshV, sx, sy, rect, !!pinnedVehicle);
          }
        } else {
          if (pinnedVehicle && pinnedVehicle.id === activeTrack.id) pinnedVehicle = null;
          if (hoveredVehicle && hoveredVehicle.id === activeTrack.id) hoveredVehicle = null;
          hideVehicleTooltip();
        }
      }

      requestAnimationFrame(renderLoop);
    }

    // Initialize all sub-systems
    initBackendSync();
    initOverrides();
    initHoverTelemetry();
    runLocalTicker();
    seedInitialVehicles();
    updateVisualDisplay();
    requestAnimationFrame(renderLoop);

    // Initialize with default CAM-01 active layout and straight vehicle trajectories
    switchJunctionCamera('CAM-01');

    // Listen to language change to re-render visual display immediately
    window.addEventListener('vims-lang-changed', () => {
      updateVisualDisplay();
    });
  }

 // Live Updates for Other Dashboard Cards
  function startLiveUpdates() {
    let lastFleetVal = 14892;
    let lastPctVal = 94.8;
    let lastCritVal = 21;
    let lastWarnVal = 105;

    const toDigits = (v) => (typeof I18N !== 'undefined' && typeof I18N.toLocalizedDigits === 'function' ? I18N.toLocalizedDigits(v) : v);

    function renderFleetStats() {
      const fleetNum = document.getElementById('statActiveFleetNum');
      const denomEl = document.getElementById('statActiveFleetDenom');
      if (fleetNum) {
        fleetNum.textContent = toDigits(lastFleetVal.toLocaleString());
      }
      if (denomEl) {
        denomEl.textContent = toDigits('/18,500');
      }

      const pctEl = document.getElementById('statOperationalPct');
      if (pctEl) {
        pctEl.textContent = toDigits(lastPctVal.toFixed(1) + '%');
      }
    }

    function renderAlertStats() {
      const critEls = [document.getElementById('statCriticalCount'), document.getElementById('statCriticalCount2')];
      const warnEls = [document.getElementById('statWarningCount'), document.getElementById('statWarningCount2')];
      const critStr = toDigits(lastCritVal);
      const warnStr = toDigits(lastWarnVal);
      critEls.forEach(el => { if (el) el.textContent = critStr; });
      warnEls.forEach(el => { if (el) el.textContent = warnStr; });
    }

    // Initial render with localized digits immediately
    renderFleetStats();
    renderAlertStats();

    // Update fleet count periodically
    setInterval(() => {
      const base = 14892;
      const delta = Math.floor(Math.random() * 20) - 10;
      lastFleetVal = Math.max(14800, Math.min(14950, base + delta));

      const pcts = [94.5, 94.6, 94.7, 94.8, 94.9, 95.0, 95.1];
      lastPctVal = pcts[Math.floor(Math.random() * pcts.length)];

      renderFleetStats();
    }, 5000);

    // Update alert counts
    setInterval(() => {
      lastCritVal = 18 + Math.floor(Math.random() * 8);
      lastWarnVal = 98 + Math.floor(Math.random() * 15);
      renderAlertStats();
    }, 8000);

    window.addEventListener('vims-lang-changed', () => {
      renderFleetStats();
      renderAlertStats();
    });
  }

 // Toast Notification Helper
  function notify(msg, type = 'info') {
    if (typeof COMMAND !== 'undefined' && typeof COMMAND.showToast === 'function') {
      COMMAND.showToast(msg, type);
      return;
    }
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-wrap';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  window.notify = notify;

  // 1. FLEET OVERVIEW CONTROLLER
  const FLEET_DATA = [
    { id: 'PCR-01', plate: 'MH 12 DE 1042', classType: 'PCR', model: 'Mahindra Scorpio-N 4x4 Interceptor', sector: 'JM Road', commander: 'ASI P. Deshmukh (PN-5120)', speed: 42, fuel: 78, status: 'ON PATROL', statusClass: 'badge-green' },
    { id: 'PCR-04', plate: 'MH 12 Q 4091', classType: 'PCR', model: 'Tata Safari Tactical Interceptor', sector: 'Swargate', commander: 'HC V. Kadam (PN-6304)', speed: 0, fuel: 91, status: 'ON DUTY', statusClass: 'badge-green' },
    { id: 'MOTO-08', plate: 'MH 12 TR 8812', classType: 'MOTO', model: 'Bajaj Dominar 400 Strike', sector: 'JM Road', commander: 'Const. S. Shinde (PN-7219)', speed: 38, fuel: 65, status: 'ON PATROL', statusClass: 'badge-green' },
    { id: 'MOTO-14', plate: 'MH 12 TR 8824', classType: 'MOTO', model: 'Bajaj Dominar 400 Quick Strike', sector: 'Hinjewadi', commander: 'Const. A. Pawar (PN-8101)', speed: 56, fuel: 52, status: 'RESPONDING', statusClass: 'badge-blue' },
    { id: 'TOW-03', plate: 'MH 12 T 9921', classType: 'TOW', model: 'Ashok Leyland Hydraulic Crane', sector: 'Swargate', commander: 'Operator G. Chavan', speed: 18, fuel: 84, status: 'DISPATCHED', statusClass: 'badge-amber' },
    { id: 'TOW-07', plate: 'MH 12 T 9945', classType: 'TOW', model: 'Tata 1109 Flatbed Recovery', sector: 'NH-4', commander: 'Operator R. Mane', speed: 0, fuel: 44, status: 'STANDBY', statusClass: 'badge-gray' },
    { id: 'EMS-04', plate: 'MH 12 EM 0108', classType: 'EMS', model: 'Force Traveller ALS (ICU)', sector: 'JM Road', commander: 'Dr. K. Joshi / ALS Crew', speed: 64, fuel: 89, status: 'GREEN CORRIDOR', statusClass: 'badge-green' },
    { id: 'EMS-11', plate: 'MH 12 EM 0111', classType: 'EMS', model: 'Force Traveller Basic Life Support', sector: 'Airport', commander: 'Paramedic Beta Team', speed: 0, fuel: 95, status: 'STANDBY', statusClass: 'badge-gray' },
    { id: 'PCR-09', plate: 'MH 12 FG 2301', classType: 'PCR', model: 'Toyota Innova Crysta Command', sector: 'Airport', commander: 'Sub-Insp. D. Shinde', speed: 48, fuel: 71, status: 'ON PATROL', statusClass: 'badge-green' },
    { id: 'MOTO-21', plate: 'MH 12 TR 8901', classType: 'MOTO', model: 'Royal Enfield Hunter 350', sector: 'Hinjewadi', commander: 'Const. M. Thorat', speed: 25, fuel: 80, status: 'ON PATROL', statusClass: 'badge-green' }
  ];

  function initFleetOverview() {
    const tbody = document.getElementById('fleetTableBody');
    const searchInput = document.getElementById('fleetSearchInput');
    const sectorFilter = document.getElementById('fleetSectorFilter');
    const classFilter = document.getElementById('fleetClassFilter');
    const exportBtn = document.getElementById('btnExportFleet');

    if (!tbody) return;

    function render() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const sec = sectorFilter ? sectorFilter.value : 'ALL';
      const cls = classFilter ? classFilter.value : 'ALL';

      const filtered = FLEET_DATA.filter(unit => {
        if (sec !== 'ALL' && unit.sector !== sec) return false;
        if (cls !== 'ALL' && unit.classType !== cls) return false;
        if (q) {
          const hay = `${unit.id} ${unit.plate} ${unit.model} ${unit.commander} ${unit.sector}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-14">No fleet units matching the selected filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(u => `
        <tr>
          <td class="font-mono font-bold" style="color:var(--text-bright);">${u.id}</td>
          <td class="cell-mono font-bold" style="color:#38bdf8;">${u.plate}</td>
          <td>
            <div style="font-weight:600; color:var(--text-bright);">${u.model}</div>
            <div class="text-xs text-muted">${u.classType === 'PCR' ? 'Police Interceptor' : u.classType === 'MOTO' ? 'Quick Strike Bike' : u.classType === 'TOW' ? 'Heavy Recovery' : 'Paramedic EMS'}</div>
          </td>
          <td><span class="sector-tag">${u.sector}</span></td>
          <td>${u.commander}</td>
          <td>
            <div class="font-mono text-xs" style="color:${u.speed > 0 ? '#10b981' : '#8e9bb0'};">${u.speed} km/h</div>
            <div class="fuel-bar-wrap" title="Fuel: ${u.fuel}%"><div class="fuel-bar-fill" style="width:${u.fuel}%;"></div></div>
          </td>
          <td><span class="badge ${u.statusClass}">${u.status}</span></td>
          <td>
            <div class="flex gap-6">
              <button class="btn btn-outline btn-xs" data-hail="${u.id}" data-commander="${u.commander}">Radio</button>
              <button class="btn btn-outline btn-xs" data-dispatch="${u.id}">Dispatch</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-hail]').forEach(btn => {
        btn.addEventListener('click', () => {
          const unitId = btn.getAttribute('data-hail');
          const comm = btn.getAttribute('data-commander');
          notify(`[TETRA NET] Transmitting priority radio hail to ${comm} (${unitId})`, 'info');
        });
      });

      tbody.querySelectorAll('[data-dispatch]').forEach(btn => {
        btn.addEventListener('click', () => {
          const unitId = btn.getAttribute('data-dispatch');
          const unit = FLEET_DATA.find(x => x.id === unitId);
          if (unit) {
            unit.status = unit.status === 'RESPONDING' ? 'ON PATROL' : 'RESPONDING';
            unit.statusClass = unit.status === 'RESPONDING' ? 'badge-blue' : 'badge-green';
            render();
            notify(`Unit ${unitId} status updated: ${unit.status}`, 'info');
          }
        });
      });
    }

    if (searchInput) searchInput.addEventListener('input', render);
    if (sectorFilter) sectorFilter.addEventListener('change', render);
    if (classFilter) classFilter.addEventListener('change', render);

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const headers = ['Unit ID', 'Plate Number', 'Class', 'Model', 'Assigned Sector', 'Commander', 'Speed (km/h)', 'Fuel (%)', 'Status'];
        const rows = FLEET_DATA.map(u => [u.id, u.plate, u.classType, `"${u.model}"`, `"${u.sector}"`, `"${u.commander}"`, u.speed, u.fuel, u.status]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `pune_police_fleet_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        notify('Fleet manifest CSV exported successfully.', 'success');
      });
    }

    setInterval(() => {
      FLEET_DATA.forEach(u => {
        if (u.speed > 0) {
          const delta = Math.floor(Math.random() * 5) - 2;
          u.speed = Math.max(15, Math.min(85, u.speed + delta));
        }
      });
      const fleetView = document.getElementById('view-fleet-overview');
      if (fleetView && fleetView.classList.contains('active')) {
        render();
      }
    }, 4000);

    render();
  }

  // 2. INCIDENT LOGS CONTROLLER
  const INCIDENT_DATA = [
    { id: 'INC-8891', time: '10:48:12', severity: 'CRITICAL', plate: 'MH 12 AB 9981', location: 'Swargate Bus Depot Jn', violation: 'Red Light Violation (Signal Jump at 4.2s red phase)', unit: 'PCR-04', status: 'PENDING CHALLAN', fineAmount: 1000, act: 'Sec 184 MVA' },
    { id: 'INC-8890', time: '10:45:30', severity: 'CRITICAL', plate: 'DL 04 C AF 5571', location: 'Airport Road 509 Jn', violation: 'Extreme Speeding (94 km/h in 50 km/h urban corridor)', unit: 'Radar-08 Auto', status: 'CHALLAN ISSUED', fineAmount: 2000, act: 'Sec 183 MVA' },
    { id: 'INC-8889', time: '10:41:05', severity: 'WARNING', plate: 'MH 14 EU 4092', location: 'Deccan Gymkhana Sq', violation: 'Wrong-side Entry onto One-Way Arterial', unit: 'MOTO-08', status: 'INTERCEPTED', fineAmount: 1500, act: 'Sec 177 MVA' },
    { id: 'INC-8888', time: '10:37:44', severity: 'CRITICAL', plate: 'MH 12 DE 1433', location: 'JM-FC Central Jn', violation: 'Hotlist Match (Stolen Vehicle Watchlist CCTNS Hit)', unit: 'PCR-01 + MOTO-08', status: 'PURSUIT ACTIVE', fineAmount: 0, act: 'Sec 379 IPC' },
    { id: 'INC-8887', time: '10:32:19', severity: 'WARNING', plate: 'MH 12 QP 5510', location: 'Hinjewadi Phase-1 Circle', violation: 'Heavy Commercial Intrusion into PMPML Bus Rapid Lane', unit: 'ANPR Node 05', status: 'PENDING REVIEW', fineAmount: 1000, act: 'Sec 115 MVA' },
    { id: 'INC-8886', time: '10:25:00', severity: 'ADVISORY', plate: 'MH 20 DQ 7731', location: 'Senapati Bapat Road', violation: 'Triple Riding / Without Helmet on 2-Wheeler', unit: 'CAM-03 OCR', status: 'RESOLVED', fineAmount: 1000, act: 'Sec 194D MVA' },
    { id: 'INC-8885', time: '10:19:14', severity: 'WARNING', plate: 'MH 12 KK 2199', location: 'Karve Road Jn', violation: 'Illegal Parking Blocking Fire Hydrant Access', unit: 'TOW-03', status: 'TOW EN ROUTE', fineAmount: 1500, act: 'Sec 122 MVA' }
  ];

  function initIncidentLogs() {
    const tbody = document.getElementById('incidentsTableBody');
    const searchInput = document.getElementById('incSearchInput');
    const sevFilter = document.getElementById('incSeverityFilter');
    const typeFilter = document.getElementById('incTypeFilter');
    const btnChallan = document.getElementById('btnIssueChallan');

    if (!tbody) return;

    function render() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const sev = sevFilter ? sevFilter.value : 'ALL';
      const typ = typeFilter ? typeFilter.value : 'ALL';

      const filtered = INCIDENT_DATA.filter(inc => {
        if (sev !== 'ALL' && inc.severity !== sev) return false;
        if (typ !== 'ALL' && !inc.violation.toLowerCase().includes(typ.toLowerCase())) return false;
        if (q) {
          const hay = `${inc.id} ${inc.plate} ${inc.location} ${inc.violation} ${inc.unit}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-14">No incidents match the search criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(inc => {
        const sevClass = inc.severity === 'CRITICAL' ? 'badge-red' : inc.severity === 'WARNING' ? 'badge-amber' : 'badge-gray';
        const stClass = inc.status === 'CHALLAN ISSUED' ? 'badge-blue' : inc.status === 'RESOLVED' ? 'badge-green' : inc.status === 'PURSUIT ACTIVE' ? 'badge-red' : 'badge-amber';

        return `
          <tr>
            <td class="font-mono font-bold" style="color:var(--text-bright);">${inc.id}</td>
            <td class="font-mono text-xs text-muted">${inc.time}</td>
            <td><span class="badge ${sevClass}">${inc.severity}</span></td>
            <td class="cell-mono font-bold" style="color:#38bdf8;">${inc.plate}</td>
            <td>${inc.location}</td>
            <td>
              <div style="color:var(--text-bright); font-weight:500;">${inc.violation}</div>
              <div class="text-xs text-muted">${inc.act} ${inc.fineAmount ? '· Fine: ₹' + inc.fineAmount : ''}</div>
            </td>
            <td class="font-mono text-xs">${inc.unit}</td>
            <td><span class="badge ${stClass}">${inc.status}</span></td>
            <td>
              <div class="flex gap-6">
                ${inc.status !== 'CHALLAN ISSUED' && inc.fineAmount > 0 ?
                  `<button class="btn btn-outline btn-xs" data-issue-challan="${inc.id}">Challan</button>` :
                  `<button class="btn btn-outline btn-xs" data-verify="${inc.id}">Verify</button>`
                }
              </div>
            </td>
          </tr>
        `;
      }).join('');

      tbody.querySelectorAll('[data-issue-challan]').forEach(btn => {
        btn.addEventListener('click', () => {
          const incId = btn.getAttribute('data-issue-challan');
          const inc = INCIDENT_DATA.find(x => x.id === incId);
          if (inc) {
            inc.status = 'CHALLAN ISSUED';
            render();
            const chNo = 'MH-PN-2026-CH-' + Math.floor(10000 + Math.random() * 90000);
            notify(`[E-CHALLAN GENERATED] Ref #${chNo} for ₹${inc.fineAmount}. SMS notice sent to registered mobile of ${inc.plate}`, 'success');
          }
        });
      });

      tbody.querySelectorAll('[data-verify]').forEach(btn => {
        btn.addEventListener('click', () => {
          const incId = btn.getAttribute('data-verify');
          const inc = INCIDENT_DATA.find(x => x.id === incId);
          if (inc) {
            inc.status = 'RESOLVED';
            render();
            notify(`Incident ${incId} verified and logged to court ledger.`, 'info');
          }
        });
      });
    }

    if (searchInput) searchInput.addEventListener('input', render);
    if (sevFilter) sevFilter.addEventListener('change', render);
    if (typeFilter) typeFilter.addEventListener('change', render);

    if (btnChallan) {
      btnChallan.addEventListener('click', () => {
        const pending = INCIDENT_DATA.find(x => x.status === 'PENDING CHALLAN');
        if (pending) {
          pending.status = 'CHALLAN ISSUED';
          render();
          const chNo = 'MH-PN-2026-CH-' + Math.floor(10000 + Math.random() * 90000);
          notify(`[E-CHALLAN DISPATCHED] Batch ref #${chNo} issued to ${pending.plate} under ${pending.act}.`, 'success');
        } else {
          notify('All current pending violations already have e-challans generated.', 'info');
        }
      });
    }

    render();
  }

  // 3. ROUTE MANAGEMENT & AUTONOMOUS GREEN CORRIDOR CONTROLLER
  function initRouteMgmt() {
    const form = document.getElementById('greenWaveDispatchForm');
    const banner = document.getElementById('greenWaveBanner');
    const titleEl = document.getElementById('gwActiveRouteTitle');
    const subEl = document.getElementById('gwActiveRouteSub');
    const timerEl = document.getElementById('gwCountdownTimer');
    const cancelBtn = document.getElementById('btnCancelGreenWave');

    let countdownInterval = null;
    let secondsLeft = 300;

    function formatTime(s) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const origin = document.getElementById('gwOriginSelect')?.value || 'Sassoon General Hospital';
        const dest = document.getElementById('gwDestSelect')?.value || 'Swargate Bus Depot';
        const prio = document.getElementById('gwPriorityClass')?.value || 'Critical ICU Ambulance';
        const plate = document.getElementById('gwVehiclePlate')?.value || 'AMB-108-04';

        if (banner) {
          banner.style.display = 'flex';
          if (titleEl) titleEl.textContent = `GREEN CORRIDOR ACTIVE: ${origin.split('(')[0].toUpperCase()} → ${dest.split('(')[0].toUpperCase()}`;
          if (subEl) subEl.textContent = `Priority: ${prio} (${plate}) · 6 ATSC Signal Heads Locked to Continuous Green Wave Progression`;
        }

        secondsLeft = 320;
        if (timerEl) timerEl.textContent = formatTime(secondsLeft);

        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
          secondsLeft--;
          if (timerEl) timerEl.textContent = formatTime(secondsLeft);
          if (secondsLeft <= 0) {
            clearInterval(countdownInterval);
            if (banner) banner.style.display = 'none';
            notify(`[GREEN WAVE COMPLETE] Emergency vehicle ${plate} reached destination. Signal controllers restored.`, 'success');
          }
        }, 1000);

        fetch('/api/junction/regulation-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'FORCE_NS' })
        }).catch(() => {});

        notify(`[EMERGENCY PREEMPTION ACTIVE] Continuous green wave locked from ${origin.split('(')[0]} to ${dest.split('(')[0]} for ${plate}.`, 'success');
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (countdownInterval) clearInterval(countdownInterval);
        if (banner) banner.style.display = 'none';

        fetch('/api/junction/regulation-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'RESUME_AUTO' })
        }).catch(() => {});

        notify('[EMERGENCY PREEMPTION ABORTED] ATSC signal nodes restored to autonomous adaptive density balancing.', 'info');
      });
    }
  }

  // 4. ASSET DATABASE CONTROLLER
  const ASSET_DATA = [
    { tag: 'AST-ATSC-01', name: 'ATSC-ITMS Type 3 Adaptive Controller', spec: 'Intel Atom x6413E · CAN-Bus · SCATS/SCOOT', loc: 'JM-FC Central Junction (Node 01)', ip: '192.168.10.101', mac: '00:1B:44:11:3A:B1', fw: 'v4.2.1-pune', uptime: '99.98% (42d)', status: 'ONLINE', statusClass: 'badge-green', type: 'ATSC' },
    { tag: 'AST-ANPR-03', name: 'Hikvision 4K Ultra-HD LPR Optical Node', spec: 'Dual 8MP Starlight CMOS · 950nm IR Illuminator', loc: 'Swargate South Gate Flyover (Node 07)', ip: '192.168.10.145', mac: '70:4D:7B:88:22:90', fw: 'v2.18.0-anpr', uptime: '99.85% (19d)', status: 'ONLINE', statusClass: 'badge-green', type: 'ANPR' },
    { tag: 'AST-RADAR-08', name: 'K-Band Dual-Beam Doppler Speed Radar', spec: '24.125 GHz · ±1 km/h Accuracy · 150m Range', loc: 'Airport Expressway Km 4.2 (Node 12)', ip: '192.168.12.55', mac: 'AC:DE:48:00:11:22', fw: 'v3.04-rad', uptime: '100.0% (88d)', status: 'ONLINE', statusClass: 'badge-green', type: 'RADAR' },
    { tag: 'AST-VMS-02', name: 'Full RGB Matrix Variable Message Sign', spec: '384×128 P10 Outdoor LED · NTCIP 1203 Protocol', loc: 'Goodluck Chowk (FC Road - Node 02)', ip: '192.168.10.210', mac: '3C:52:82:A1:04:F2', fw: 'v1.9.3-led', uptime: '99.40% (14d)', status: 'ONLINE', statusClass: 'badge-green', type: 'VMS' },
    { tag: 'AST-EDGE-05', name: 'NVIDIA Jetson Orin 64GB Edge AI Compute', spec: '275 TOPS AI · TensorRT 8.6 · 8x RTSP Streams', loc: 'Deccan Gymkhana Cluster (Node 04)', ip: '192.168.10.20', mac: '48:B0:2D:6F:89:12', fw: 'JetPack 5.1.2', uptime: '99.99% (56d)', status: 'ONLINE', statusClass: 'badge-green', type: 'ANPR' },
    { tag: 'AST-ECB-09', name: 'Solar Emergency Call Box & Intercom', spec: 'SIP VoLTE · Solar Battery Backup · Direct PCR Link', loc: 'Hinjewadi Phase-1 Circle (Node 09)', ip: '192.168.14.88', mac: '00:25:96:12:43:08', fw: 'v2.1.0-sip', uptime: '98.90% (7d)', status: 'ONLINE', statusClass: 'badge-green', type: 'ECB' }
  ];

  function initAssetDatabase() {
    const tbody = document.getElementById('assetTableBody');
    const searchInput = document.getElementById('assetSearchInput');
    const typeFilter = document.getElementById('assetTypeFilter');

    if (!tbody) return;

    function render() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const typ = typeFilter ? typeFilter.value : 'ALL';

      const filtered = ASSET_DATA.filter(ast => {
        if (typ !== 'ALL' && ast.type !== typ) return false;
        if (q) {
          const hay = `${ast.tag} ${ast.name} ${ast.loc} ${ast.ip} ${ast.mac} ${ast.fw}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-14">No infrastructure assets matching search criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(a => `
        <tr>
          <td class="font-mono font-bold" style="color:var(--text-bright);">${a.tag}</td>
          <td>
            <div style="font-weight:600; color:var(--text-bright);">${a.name}</div>
            <div class="text-xs text-muted">${a.spec}</div>
          </td>
          <td>${a.loc}</td>
          <td class="font-mono text-xs">
            <div>${a.ip}</div>
            <div class="text-muted" style="font-size:10px;">${a.mac}</div>
          </td>
          <td class="font-mono text-xs text-muted">${a.fw}</td>
          <td class="text-xs" style="color:#10b981;">${a.uptime}</td>
          <td><span class="badge ${a.statusClass}">${a.status}</span></td>
          <td>
            <div class="flex gap-6">
              <button class="btn btn-outline btn-xs" data-ping="${a.ip}">Ping</button>
              <button class="btn btn-outline btn-xs" data-reboot="${a.tag}">Reboot</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-ping]').forEach(btn => {
        btn.addEventListener('click', () => {
          const ip = btn.getAttribute('data-ping');
          const ms = (2.2 + Math.random() * 2.5).toFixed(1);
          notify(`[ICMP ECHO] Reply from ${ip}: bytes=32 time=${ms}ms TTL=64 (Health: OPTIMAL)`, 'info');
        });
      });

      tbody.querySelectorAll('[data-reboot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tag = btn.getAttribute('data-reboot');
          notify(`[SSH REBOOT] Daemon reload signal transmitted to ${tag}. Service restarting...`, 'info');
        });
      });
    }

    if (searchInput) searchInput.addEventListener('input', render);
    if (typeFilter) typeFilter.addEventListener('change', render);

    render();
  }

  // 5. STAFF ROSTER CONTROLLER
  const STAFF_DATA = [
    { badge: 'PN-4402', name: 'Insp. Rajesh Sharma', rank: 'PI (Police Inspector)', assignment: 'Watch Commander', sector: 'ICCC Central Console 03', channel: 'VHF-NET-01 (Tactical)', status: 'ON DUTY', contact: '+91 98220 14402', statusClass: 'badge-green' },
    { badge: 'PN-5120', name: 'Sub-Insp. Sunita Patil', rank: 'PSI (Police Sub-Inspector)', assignment: 'Sector Field Lead', sector: 'Sector 2: JM-FC Arterial', channel: 'VHF-NET-02 (Patrol)', status: 'ON PATROL', contact: '+91 98220 15120', statusClass: 'badge-green' },
    { badge: 'PN-6304', name: 'ASI Vikram Kadam', rank: 'ASI (Asst Sub-Inspector)', assignment: 'Traffic Enforcement', sector: 'Sector 1: Swargate Zone', channel: 'VHF-NET-01 (Tactical)', status: 'ON DUTY', contact: '+91 98220 16304', statusClass: 'badge-green' },
    { badge: 'PN-7219', name: 'Head Const. Santosh Shinde', rank: 'HC (Head Constable)', assignment: 'Quick Strike Interceptor', sector: 'Sector 2: JM-FC Arterial', channel: 'VHF-NET-02 (Patrol)', status: 'ON PATROL', contact: '+91 98220 17219', statusClass: 'badge-green' },
    { badge: 'PN-8101', name: 'Constable Amit Pawar', rank: 'PC (Police Constable)', assignment: 'IT Park Rapid Response', sector: 'Sector 3: Hinjewadi', channel: 'VHF-NET-03 (IT Corridor)', status: 'RESPONDING', contact: '+91 98220 18101', statusClass: 'badge-blue' },
    { badge: 'PN-9045', name: 'Traffic Warden Geeta Salunke', rank: 'TW (Traffic Warden)', assignment: 'Pedestrian & Signal Assist', sector: 'Goodluck Chowk (FC Rd)', channel: 'VHF-NET-02 (Patrol)', status: 'ON DUTY', contact: '+91 98220 19045', statusClass: 'badge-green' },
    { badge: 'PN-3382', name: 'Operator Ganesh Chavan', rank: 'TR (Tow Rig Lead)', assignment: 'Heavy Obstruction Clearance', sector: 'Sector 1: Swargate Zone', channel: 'VHF-NET-04 (Logistics)', status: 'DISPATCHED', contact: '+91 98220 13382', statusClass: 'badge-amber' }
  ];

  function initStaffRoster() {
    const tbody = document.getElementById('staffTableBody');
    const searchInput = document.getElementById('staffSearchInput');
    const statusFilter = document.getElementById('staffStatusFilter');

    if (!tbody) return;

    function render() {
      const q = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const st = statusFilter ? statusFilter.value : 'ALL';

      const filtered = STAFF_DATA.filter(staff => {
        if (st !== 'ALL' && staff.status !== st) return false;
        if (q) {
          const hay = `${staff.badge} ${staff.name} ${staff.rank} ${staff.assignment} ${staff.sector} ${staff.channel}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-14">No personnel found for the current filter.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(s => `
        <tr>
          <td class="font-mono font-bold" style="color:var(--text-bright);">${s.badge}</td>
          <td>
            <div style="font-weight:600; color:var(--text-bright);">${s.name}</div>
            <div class="text-xs text-muted">${s.rank}</div>
          </td>
          <td>${s.assignment}</td>
          <td><span class="sector-tag">${s.sector}</span></td>
          <td><span class="radio-channel-tag">${s.channel}</span></td>
          <td><span class="badge ${s.statusClass}">${s.status}</span></td>
          <td class="font-mono text-xs text-muted">${s.contact}</td>
          <td>
            <div class="flex gap-6">
              <button class="btn btn-outline btn-xs" data-radio-call="${s.badge}" data-channel="${s.channel}" data-name="${s.name}">Hail</button>
              <button class="btn btn-outline btn-xs" data-reassign="${s.badge}">Reassign</button>
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('[data-radio-call]').forEach(btn => {
        btn.addEventListener('click', () => {
          const ch = btn.getAttribute('data-channel');
          const name = btn.getAttribute('data-name');
          notify(`[TETRA PTT] Connected to ${name} on ${ch}. Microphone open.`, 'info');
        });
      });

      tbody.querySelectorAll('[data-reassign]').forEach(btn => {
        btn.addEventListener('click', () => {
          const badge = btn.getAttribute('data-reassign');
          const staff = STAFF_DATA.find(x => x.badge === badge);
          if (staff) {
            const sectors = ['Sector 1: Swargate Zone', 'Sector 2: JM-FC Arterial', 'Sector 3: Hinjewadi', 'Sector 4: Airport Expressway'];
            const curIdx = sectors.indexOf(staff.sector);
            staff.sector = sectors[(curIdx + 1) % sectors.length];
            render();
            notify(`${staff.name} (${badge}) reassigned to ${staff.sector}. Dispatch order transmitted.`, 'info');
          }
        });
      });
    }

    if (searchInput) searchInput.addEventListener('input', render);
    if (statusFilter) statusFilter.addEventListener('change', render);

    render();
  }

  // 6. SYSTEM LOGS & TELEMETRY AUDIT TERMINAL CONTROLLER
  function initSystemLogs() {
    const terminal = document.getElementById('systemLogTerminal');
    const subsysFilter = document.getElementById('logSubsysFilter');
    const levelFilter = document.getElementById('logLevelFilter');
    const btnPause = document.getElementById('btnToggleLogPause');
    const btnClear = document.getElementById('btnClearLogs');
    const btnExport = document.getElementById('btnExportAudit');

    if (!terminal) return;

    let isPaused = false;
    const logs = [
      { ts: '01:10:04.102', subsys: 'TRAFFIC_ENGINE', lvl: 'INFO', msg: 'ATSC Junction Node 01: Cycle #148 phase transition NS_GREEN -> NS_AMBER. Time in phase: 25.0s.' },
      { ts: '01:10:07.419', subsys: 'ANPR_OCR', lvl: 'INFO', msg: 'CAM-03 (JM Road): Optical OCR processed frame #48892 in 18.4ms. Plate parsed: [MH 12 DE 1042] conf=0.97.' },
      { ts: '01:10:09.112', subsys: 'SMS_SERVICE', lvl: 'INFO', msg: 'Fast2SMS Gateway: Dispatched e-Challan SMS notice to +91 98220 14892 (HTTP 200 OK - deliver_status: DELIVRD).' },
      { ts: '01:10:11.854', subsys: 'AUTH_GATEWAY', lvl: 'SEC', msg: 'Law enforcement token verification passed for badge MH-PN-4402 (Session active, exp: 28740s).' },
      { ts: '01:10:14.220', subsys: 'POLICE_RADIO', lvl: 'INFO', msg: 'TETRA Repeater Node 02: VHF-NET-02 signal rssi=-64dBm (Optimal link quality).' },
      { ts: '01:10:17.391', subsys: 'TRAFFIC_ENGINE', lvl: 'INFO', msg: 'ATSC Junction Node 01: All-Red clearance hold executed (2.0s). Switching green priority to EW corridor.' },
      { ts: '01:10:20.005', subsys: 'ANPR_OCR', lvl: 'WARN', msg: 'CAM-01 (Swargate): Low illumination frame detected. Triggering 950nm IR illuminator bank.' },
      { ts: '01:10:23.771', subsys: 'SMS_SERVICE', lvl: 'INFO', msg: 'OTP Verification engine: OTP challenge validated for Inspector console #3.' },
      { ts: '01:10:26.502', subsys: 'TRAFFIC_ENGINE', lvl: 'INFO', msg: 'PCU density balance recalculated: Lane 1 (NS) PCU=19.4 | Lane 2 (EW) PCU=12.1.' },
      { ts: '01:10:29.814', subsys: 'AUTH_GATEWAY', lvl: 'SEC', msg: 'Audit trail signed with HMAC-SHA256 signature sha_c981a2f1... Ledger block #9014 committed.' }
    ];

    const RANDOM_LOG_POOL = [
      { subsys: 'TRAFFIC_ENGINE', lvl: 'INFO', msg: 'ATSC Controller Node 01: Adaptive cycle phase adjusted. Minimum green window verified.' },
      { subsys: 'ANPR_OCR', lvl: 'INFO', msg: 'Optical LPR engine: Frame processed in 16.8ms. Vehicle type classified as SUV/Car (PCU weight 1.0).' },
      { subsys: 'SMS_SERVICE', lvl: 'INFO', msg: 'Fast2SMS Provider: Balance query returned 4,890 available SMS credits on transactional route.' },
      { subsys: 'AUTH_GATEWAY', lvl: 'SEC', msg: 'Security heartbeat: 0 failed login attempts in last 300s. IP whitelist rule active.' },
      { subsys: 'POLICE_RADIO', lvl: 'INFO', msg: 'TETRA Net 01: Voice encryption key cycle synchronized with ICCC base station.' },
      { subsys: 'TRAFFIC_ENGINE', lvl: 'WARN', msg: 'Queue length warning: Swargate North approach exceeded 80m queue threshold.' },
      { subsys: 'ANPR_OCR', lvl: 'INFO', msg: 'Hotlist database query: 0 active stolen vehicle warrants triggered for current bounding box.' },
      { subsys: 'SMS_SERVICE', lvl: 'INFO', msg: 'Emergency green corridor notification broadcasted to sector control consoles.' }
    ];

    function getLevelColor(lvl) {
      if (lvl === 'ERROR') return '#ef4444';
      if (lvl === 'WARN') return '#f59e0b';
      if (lvl === 'SEC') return '#38bdf8';
      return '#10b981';
    }

    function renderTerminal() {
      const sub = subsysFilter ? subsysFilter.value : 'ALL';
      const lvl = levelFilter ? levelFilter.value : 'ALL';

      const filtered = logs.filter(item => {
        if (sub !== 'ALL' && item.subsys !== sub) return false;
        if (lvl !== 'ALL' && item.lvl !== lvl) return false;
        return true;
      });

      terminal.innerHTML = filtered.map(item => `
        <div class="log-entry">
          <span class="log-ts">${item.ts}</span>
          <span class="log-subsys">[${item.subsys}]</span>
          <span class="log-level" style="color:${getLevelColor(item.lvl)};">[${item.lvl}]</span>
          <span class="log-msg">${item.msg}</span>
        </div>
      `).join('');

      if (!isPaused) {
        terminal.scrollTop = terminal.scrollHeight;
      }
    }

    if (subsysFilter) subsysFilter.addEventListener('change', renderTerminal);
    if (levelFilter) levelFilter.addEventListener('change', renderTerminal);

    if (btnPause) {
      btnPause.addEventListener('click', () => {
        isPaused = !isPaused;
        btnPause.textContent = isPaused ? 'Resume Feed' : 'Pause Feed';
        btnPause.classList.toggle('btn-primary', isPaused);
        notify(isPaused ? 'Telemetry log terminal paused.' : 'Telemetry log terminal resumed.', 'info');
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        logs.length = 0;
        renderTerminal();
        notify('Terminal log buffer cleared.', 'info');
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const text = logs.map(l => `[${l.ts}] [${l.subsys}] [${l.lvl}] ${l.msg}`).join('\n');
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pune_iccc_system_audit_${Date.now()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify('Immutable system audit log exported.', 'success');
      });
    }

    setInterval(() => {
      if (isPaused) return;

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const sample = RANDOM_LOG_POOL[Math.floor(Math.random() * RANDOM_LOG_POOL.length)];

      logs.push({
        ts: timeStr,
        subsys: sample.subsys,
        lvl: sample.lvl,
        msg: sample.msg
      });

      if (logs.length > 200) logs.shift();

      const sysView = document.getElementById('view-system-logs');
      if (sysView && sysView.classList.contains('active')) {
        renderTerminal();
      }
    }, 2500);

    renderTerminal();
  }

  // 7. DIFF ANALYSIS CONTROLLER (CORRIDOR FLOW & ANPR DISCREPANCY)
  function initDiffAnalysis() {
    const diffView = document.getElementById('view-diff-analysis');
    if (!diffView) return;

    function isDiffActive() {
      const view = document.getElementById('view-diff-analysis');
      return !!(view && view.classList.contains('active'));
    }

    // DOM references
    const elL1PhaseBadge = document.getElementById('diffL1PhaseBadge');
    const elL1Pcu = document.getElementById('diffL1Pcu');
    const elL1Veh = document.getElementById('diffL1Veh');
    const elL1Queue = document.getElementById('diffL1Queue');
    const elL1Throughput = document.getElementById('diffL1Throughput');
    const elL1Balance = document.getElementById('diffL1Balance');
    const elL1Speed = document.getElementById('diffL1Speed');

    const elPcuDeltaBadge = document.getElementById('diffPcuDeltaBadge');
    const elPcuDesc = document.getElementById('diffPcuDesc');
    const elQueueDelta = document.getElementById('diffQueueDelta');
    const elSignalBias = document.getElementById('diffSignalBias');

    const elL2PhaseBadge = document.getElementById('diffL2PhaseBadge');
    const elL2Pcu = document.getElementById('diffL2Pcu');
    const elL2Veh = document.getElementById('diffL2Veh');
    const elL2Queue = document.getElementById('diffL2Queue');
    const elL2Throughput = document.getElementById('diffL2Throughput');
    const elL2Balance = document.getElementById('diffL2Balance');
    const elL2Speed = document.getElementById('diffL2Speed');

    const vehicleSelect = document.getElementById('diffVehicleSelect');
    const btnRefresh = document.getElementById('btnRefreshDiff');
    const btnExport = document.getElementById('btnExportDiffAudit');

    // ANPR Optical Read
    const elAnprPlate = document.getElementById('diffAnprPlate');
    const elTagAnprPlate = document.getElementById('tagAnprPlate');
    const elAnprClass = document.getElementById('diffAnprClass');
    const elTagAnprClass = document.getElementById('tagAnprClass');
    const elAnprColor = document.getElementById('diffAnprColor');
    const elTagAnprColor = document.getElementById('tagAnprColor');
    const elAnprCorridor = document.getElementById('diffAnprCorridor');
    const elTagAnprCorridor = document.getElementById('tagAnprCorridor');
    const elAnprSpeed = document.getElementById('diffAnprSpeed');
    const elTagAnprSpeed = document.getElementById('tagAnprSpeed');

    // VAHAN National Registry Record
    const elVahanPlate = document.getElementById('diffVahanPlate');
    const elTagVahanPlate = document.getElementById('tagVahanPlate');
    const elVahanClass = document.getElementById('diffVahanClass');
    const elTagVahanClass = document.getElementById('tagVahanClass');
    const elVahanColor = document.getElementById('diffVahanColor');
    const elTagVahanColor = document.getElementById('tagVahanColor');
    const elVahanFuel = document.getElementById('diffVahanFuel');
    const elTagVahanFuel = document.getElementById('tagVahanFuel');
    const elVahanInsurance = document.getElementById('diffVahanInsurance');
    const elTagVahanInsurance = document.getElementById('tagVahanInsurance');

    // Verdict box
    const elVerdictBox = document.getElementById('diffVerdictBox');
    const elVerdictTitle = document.getElementById('diffVerdictTitle');
    const elVerdictSub = document.getElementById('diffVerdictSub');

    let selectedVehicleId = null;

    // Deterministic VAHAN registry record generation
    const vahanCache = new Map();

    function getVahanRecord(v) {
      if (vahanCache.has(v.id)) return vahanCache.get(v.id);

      // Color mapping
      let regColor = 'Arctic Silver Metallic';
      if (v.color === '#ef4444' || v.color === '#dc2626') regColor = 'Crimson Red';
      else if (v.color === '#38bdf8' || v.color === '#2563eb' || v.color === '#0284c7') regColor = 'Cobalt Blue';
      else if (v.color === '#eab308' || v.color === '#f59e0b') regColor = 'Golden Yellow';
      else if (v.color === '#10b981' || v.color === '#22c55e') regColor = 'Emerald Green';
      else if (v.color === '#334155' || v.color === '#475569') regColor = 'Charcoal Grey';
      else if (v.color === '#f1f5f9' || v.color === '#f8fafc') regColor = 'Pearl White';

      // Discrepancy injection (realistic real-world flags for demo and audit verification)
      let discrepancy = null;
      if (v.id % 7 === 0) {
        discrepancy = {
          type: 'PUC_EXPIRED',
          title: 'VERDICT: NON-COMPLIANT EMISSION PUC — EXPIRED 14 DAYS AGO',
          sub: `Optical sensor verified BS-VI ${v.fuel} standard, but NIC VAHAN PUC certificate expired on 01-Sep-2026. Automated e-Challan pending.`,
          fuelTag: 'PUC EXPIRED',
          fuelTagClass: 'badge-amber',
          insTag: 'FLAGGED',
          insTagClass: 'badge-amber'
        };
      } else if (v.id % 11 === 0) {
        discrepancy = {
          type: 'CHALLAN_PENDING',
          title: 'VERDICT: 2 UNPAID E-CHALLANS (₹2,500) — INTERCEPT FLAGGED',
          sub: 'Vehicle has 2 outstanding speed violations recorded at JM Road corridor. RTO registration flagged for enforcement action.',
          fuelTag: 'VALID PUC',
          fuelTagClass: 'diff-tag-match',
          insTag: 'UNPAID ₹2.5K',
          insTagClass: 'badge-red'
        };
      } else if (v.id % 13 === 0) {
        discrepancy = {
          type: 'COLOR_MISMATCH',
          title: 'VERDICT: OPTICAL COLOR / MAKE MISMATCH — POSSIBLE CLONED PLATE',
          sub: `Camera detected ${regColor} finish, whereas VAHAN registry records official color as 'Midnight Jet Black'. Automated alert dispatched to traffic PCR.`,
          colorMismatch: 'Midnight Jet Black',
          fuelTag: 'VALID PUC',
          fuelTagClass: 'diff-tag-match',
          insTag: 'SUSPECT',
          insTagClass: 'badge-red'
        };
      }

      const record = {
        plate: v.plate,
        model: v.model,
        color: discrepancy && discrepancy.colorMismatch ? discrepancy.colorMismatch : regColor,
        fuel: `${v.fuel} (BS-VI / MoRTH Compliant)`,
        insurance: discrepancy && discrepancy.type === 'CHALLAN_PENDING' ? 'Valid through 2027 • 2 Unpaid Challans' : 'Valid through 2027 • Clean Status',
        discrepancy: discrepancy
      };

      vahanCache.set(v.id, record);
      return record;
    }

    // ── Update Corridor 1 vs Corridor 2 Flow Diff ──
    function updateCorridorFlowDiff() {
      if (!isDiffActive()) return;
      const state = getMinimapState();
      const vehicles = getMinimapVehicles() || [];
      if (!state) return;

      const pcu1 = (state.pcu && typeof state.pcu.NS === 'number') ? state.pcu.NS : 0;
      const veh1 = (state.totals && typeof state.totals.NS === 'number') ? state.totals.NS : 0;
      const queue1 = (state.queues && typeof state.queues.NS === 'number') ? state.queues.NS : 0;

      const pcu2 = (state.pcu && typeof state.pcu.EW === 'number') ? state.pcu.EW : 0;
      const veh2 = (state.totals && typeof state.totals.EW === 'number') ? state.totals.EW : 0;
      const queue2 = (state.queues && typeof state.queues.EW === 'number') ? state.queues.EW : 0;

      // Sub-lane balance calculations
      const nsVehs = vehicles.filter(v => v.lane && v.lane.startsWith('NS'));
      const nsSub0 = nsVehs.filter(v => v.subLane === 0).length;
      const nsSub1 = nsVehs.filter(v => v.subLane === 1).length;
      const nsTotal = nsSub0 + nsSub1 || 1;
      const nsPct0 = Math.round((nsSub0 / nsTotal) * 100);

      const ewVehs = vehicles.filter(v => v.lane && v.lane.startsWith('EW'));
      const ewSub0 = ewVehs.filter(v => v.subLane === 0).length;
      const ewSub1 = ewVehs.filter(v => v.subLane === 1).length;
      const ewTotal = ewSub0 + ewSub1 || 1;
      const ewPct0 = Math.round((ewSub0 / ewTotal) * 100);

      // Average velocities
      const avgSpdNS = nsVehs.length ? Math.round((nsVehs.reduce((s, v) => s + v.currentSpeed, 0) / nsVehs.length) * 16) : 0;
      const avgSpdEW = ewVehs.length ? Math.round((ewVehs.reduce((s, v) => s + v.currentSpeed, 0) / ewVehs.length) * 16) : 0;

      // Phase badges
      const isAllRed = state.lightState === 'ALL_RED';
      const isNS = state.activeCorridor === 'NS';
      const isEW = state.activeCorridor === 'EW';
      const isNSGreen = !isAllRed && isNS && state.lightState === 'GREEN';
      const isNSAmber = !isAllRed && isNS && state.lightState === 'AMBER';
      const isEWGreen = !isAllRed && isEW && state.lightState === 'GREEN';
      const isEWAmber = !isAllRed && isEW && state.lightState === 'AMBER';
      const isNSArrowL = !isAllRed && isNS && state.arrowL === 'GREEN';
      const isNSArrowR = !isAllRed && isNS && state.arrowR === 'GREEN';
      const isEWArrowL = !isAllRed && isEW && state.arrowL === 'GREEN';
      const isEWArrowR = !isAllRed && isEW && state.arrowR === 'GREEN';

      if (elL1PhaseBadge) {
        if (isAllRed) {
          elL1PhaseBadge.textContent = 'ALL RED HOLD';
          elL1PhaseBadge.className = 'badge badge-red';
        } else if (isNSArrowL) {
          elL1PhaseBadge.textContent = '↰ LEFT ARROW';
          elL1PhaseBadge.className = 'badge badge-green';
        } else if (isNSArrowR) {
          elL1PhaseBadge.textContent = '↱ RIGHT ARROW';
          elL1PhaseBadge.className = 'badge badge-green';
        } else if (isNSGreen) {
          elL1PhaseBadge.textContent = 'GREEN WAVE';
          elL1PhaseBadge.className = 'badge badge-green';
        } else if (isNSAmber) {
          elL1PhaseBadge.textContent = 'AMBER CLEAR';
          elL1PhaseBadge.className = 'badge badge-amber';
        } else {
          elL1PhaseBadge.textContent = 'RED HOLD';
          elL1PhaseBadge.className = 'badge badge-red';
        }
      }
      if (elL1Pcu) elL1Pcu.textContent = `${pcu1.toFixed(1)} PCU`;
      if (elL1Veh) elL1Veh.textContent = `${veh1} units`;
      if (elL1Queue) elL1Queue.textContent = `${queue1}m (${queue1 > 0 ? 'Queued' : 'Fluid'})`;
      if (elL1Throughput) elL1Throughput.textContent = `${Math.round(veh1 * 260 + (isNSGreen ? 480 : 80))} veh/hr`;
      if (elL1Balance) elL1Balance.textContent = `${nsPct0}% L / ${100 - nsPct0}% R`;
      if (elL1Speed) elL1Speed.textContent = `${avgSpdNS} km/h ${avgSpdNS === 0 ? '(Halted)' : ''}`;

      if (elL2PhaseBadge) {
        if (isAllRed) {
          elL2PhaseBadge.textContent = 'ALL RED HOLD';
          elL2PhaseBadge.className = 'badge badge-red';
        } else if (isEWArrowL) {
          elL2PhaseBadge.textContent = '↰ LEFT ARROW';
          elL2PhaseBadge.className = 'badge badge-green';
        } else if (isEWArrowR) {
          elL2PhaseBadge.textContent = '↱ RIGHT ARROW';
          elL2PhaseBadge.className = 'badge badge-green';
        } else if (isEWGreen) {
          elL2PhaseBadge.textContent = 'GREEN WAVE';
          elL2PhaseBadge.className = 'badge badge-green';
        } else if (isEWAmber) {
          elL2PhaseBadge.textContent = 'AMBER CLEAR';
          elL2PhaseBadge.className = 'badge badge-amber';
        } else {
          elL2PhaseBadge.textContent = 'RED HOLD';
          elL2PhaseBadge.className = 'badge badge-red';
        }
      }
      if (elL2Pcu) elL2Pcu.textContent = `${pcu2.toFixed(1)} PCU`;
      if (elL2Veh) elL2Veh.textContent = `${veh2} units`;
      if (elL2Queue) elL2Queue.textContent = `${queue2}m (${queue2 > 0 ? 'Queued' : 'Fluid'})`;
      if (elL2Throughput) elL2Throughput.textContent = `${Math.round(veh2 * 260 + (isEWGreen ? 480 : 80))} veh/hr`;
      if (elL2Balance) elL2Balance.textContent = `${ewPct0}% L / ${100 - ewPct0}% R`;
      if (elL2Speed) elL2Speed.textContent = `${avgSpdEW} km/h ${avgSpdEW === 0 ? '(Halted)' : ''}`;

      // Center Comparative Delta
      const deltaPcu = pcu1 - pcu2;
      if (elPcuDeltaBadge) {
        elPcuDeltaBadge.textContent = `Δ ${deltaPcu >= 0 ? '+' : ''}${deltaPcu.toFixed(1)} PCU`;
        elPcuDeltaBadge.className = 'delta-badge ' + (Math.abs(deltaPcu) > 6 ? 'critical' : 'favorable');
      }
      if (elPcuDesc) {
        const pctDiff = Math.abs(Math.round((deltaPcu / (Math.min(pcu1, pcu2) || 1)) * 100));
        elPcuDesc.textContent = Math.abs(deltaPcu) < 0.5 ? 'Corridors Balanced (≤0.5 PCU Delta)' : `Corridor ${deltaPcu > 0 ? '1' : '2'} Demand +${pctDiff}% Higher`;
      }
      const deltaQueue = queue1 - queue2;
      if (elQueueDelta) {
        elQueueDelta.textContent = `${Math.abs(deltaQueue)}m Delta (${deltaQueue > 0 ? 'L1 Heavy' : deltaQueue < 0 ? 'L2 Heavy' : 'Equal Flow'})`;
      }
      if (elSignalBias) {
        if (state.regulationMode === 'ALL_RED') {
          elSignalBias.textContent = 'EMERGENCY HOLD (ALL RED)';
          elSignalBias.className = 'badge badge-red';
        } else if (state.activeCorridor === 'NS') {
          elSignalBias.textContent = 'PRIORITY TO CORRIDOR 1 (JM ROAD)';
          elSignalBias.className = 'badge badge-green';
        } else {
          elSignalBias.textContent = 'PRIORITY TO CORRIDOR 2 (FC ROAD)';
          elSignalBias.className = 'badge badge-blue';
        }
      }
    }

    // ── Update Vehicle Select & ANPR / VAHAN Discrepancy Inspector ──
    function updateVehicleInspector() {
      if (!isDiffActive()) return;
      const vehicles = getMinimapVehicles() || [];
      if (!vehicleSelect || vehicles.length === 0) return;

      // Populate or refresh select options
      const currentOpts = Array.from(vehicleSelect.options).map(o => o.value);
      const vehicleIds = vehicles.map(v => String(v.id));

      const isChanged = currentOpts.length !== (vehicleIds.length + 1) || !vehicleIds.every(id => currentOpts.includes(id));
      if (isChanged) {
        const prevVal = vehicleSelect.value;
        vehicleSelect.innerHTML = '<option value="">-- Active Minimap Vehicles --</option>';
        vehicles.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.id;
          const corridorName = v.lane && v.lane.startsWith('NS') ? 'Corridor 1 (NS)' : 'Corridor 2 (EW)';
          opt.textContent = `[${v.plate}] ${v.model} — ${corridorName}`;
          vehicleSelect.appendChild(opt);
        });

        if (prevVal && vehicles.some(v => String(v.id) === String(prevVal))) {
          vehicleSelect.value = prevVal;
          selectedVehicleId = Number(prevVal);
        } else {
          vehicleSelect.value = vehicles[0].id;
          selectedVehicleId = vehicles[0].id;
        }
      }

      // Find active vehicle
      const curVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
      if (!curVeh) return;

      selectedVehicleId = curVeh.id;
      const vahan = getVahanRecord(curVeh);

      // Populate Optical ANPR Detection
      if (elAnprPlate) elAnprPlate.textContent = curVeh.plate;
      if (elTagAnprPlate) {
        elTagAnprPlate.textContent = 'OCR 98.8%';
        elTagAnprPlate.className = 'diff-tag-match';
      }
      if (elAnprClass) elAnprClass.textContent = curVeh.typeName;
      if (elTagAnprClass) {
        elTagAnprClass.textContent = 'MATCH';
        elTagAnprClass.className = 'diff-tag-match';
      }
      if (elAnprColor) {
        let colName = 'Silver Metallic / White';
        if (curVeh.color === '#ef4444' || curVeh.color === '#dc2626') colName = 'Crimson Red';
        else if (curVeh.color === '#38bdf8' || curVeh.color === '#2563eb' || curVeh.color === '#0284c7') colName = 'Cobalt Blue';
        else if (curVeh.color === '#eab308' || curVeh.color === '#f59e0b') colName = 'Golden Yellow';
        else if (curVeh.color === '#10b981' || curVeh.color === '#22c55e') colName = 'Emerald Green';
        else if (curVeh.color === '#334155' || curVeh.color === '#475569') colName = 'Charcoal Grey';
        else if (curVeh.color === '#f1f5f9' || curVeh.color === '#f8fafc') colName = 'Pearl White';
        elAnprColor.textContent = colName;
      }
      if (elTagAnprColor) {
        if (vahan.discrepancy && vahan.discrepancy.type === 'COLOR_MISMATCH') {
          elTagAnprColor.textContent = 'MISMATCH';
          elTagAnprColor.className = 'badge badge-red';
        } else {
          elTagAnprColor.textContent = 'MATCH';
          elTagAnprColor.className = 'diff-tag-match';
        }
      }
      if (elAnprCorridor) {
        const corridorDesc = curVeh.lane && curVeh.lane.startsWith('NS') ? 'Corridor 1: JM Road (North-South)' : 'Corridor 2: FC Road (East-West)';
        elAnprCorridor.textContent = `${corridorDesc} • Sub-Lane ${curVeh.subLane === 0 ? 'Left' : 'Right'}`;
      }
      if (elTagAnprCorridor) {
        elTagAnprCorridor.textContent = 'TRACKING';
        elTagAnprCorridor.className = 'diff-tag-match';
      }
      const radarSpeed = Math.round(curVeh.currentSpeed * 16);
      if (elAnprSpeed) elAnprSpeed.textContent = `${radarSpeed} km/h`;
      if (elTagAnprSpeed) {
        if (radarSpeed > 45) {
          elTagAnprSpeed.textContent = 'OVER LIMIT';
          elTagAnprSpeed.className = 'badge badge-red';
        } else {
          elTagAnprSpeed.textContent = 'WITHIN LIMIT';
          elTagAnprSpeed.className = 'diff-tag-match';
        }
      }

      // Populate VAHAN Registry Cross-Check
      if (elVahanPlate) elVahanPlate.textContent = vahan.plate;
      if (elTagVahanPlate) {
        elTagVahanPlate.textContent = 'VERIFIED';
        elTagVahanPlate.className = 'diff-tag-match';
      }
      if (elVahanClass) elVahanClass.textContent = `${vahan.model} (${curVeh.typeName.split('(')[0].trim()})`;
      if (elTagVahanClass) {
        elTagVahanClass.textContent = 'MATCH';
        elTagVahanClass.className = 'diff-tag-match';
      }
      if (elVahanColor) elVahanColor.textContent = vahan.color;
      if (elTagVahanColor) {
        if (vahan.discrepancy && vahan.discrepancy.type === 'COLOR_MISMATCH') {
          elTagVahanColor.textContent = 'MISMATCH';
          elTagVahanColor.className = 'badge badge-red';
        } else {
          elTagVahanColor.textContent = 'MATCH';
          elTagVahanColor.className = 'diff-tag-match';
        }
      }
      if (elVahanFuel) elVahanFuel.textContent = vahan.fuel;
      if (elTagVahanFuel) {
        if (vahan.discrepancy && vahan.discrepancy.fuelTag) {
          elTagVahanFuel.textContent = vahan.discrepancy.fuelTag;
          elTagVahanFuel.className = vahan.discrepancy.fuelTagClass;
        } else {
          elTagVahanFuel.textContent = 'VALID PUC';
          elTagVahanFuel.className = 'diff-tag-match';
        }
      }
      if (elVahanInsurance) elVahanInsurance.textContent = vahan.insurance;
      if (elTagVahanInsurance) {
        if (vahan.discrepancy && vahan.discrepancy.insTag) {
          elTagVahanInsurance.textContent = vahan.discrepancy.insTag;
          elTagVahanInsurance.className = vahan.discrepancy.insTagClass;
        } else {
          elTagVahanInsurance.textContent = 'CLEARED';
          elTagVahanInsurance.className = 'diff-tag-match';
        }
      }

      // Populate Verdict Box
      if (elVerdictBox && elVerdictTitle && elVerdictSub) {
        if (vahan.discrepancy) {
          elVerdictBox.style.background = 'rgba(239, 68, 68, 0.10)';
          elVerdictBox.style.border = '1px solid rgba(239, 68, 68, 0.35)';
          elVerdictTitle.style.color = '#ef4444';
          elVerdictTitle.textContent = vahan.discrepancy.title;
          elVerdictSub.textContent = vahan.discrepancy.sub;
        } else {
          elVerdictBox.style.background = 'rgba(16, 185, 129, 0.08)';
          elVerdictBox.style.border = '1px solid rgba(16, 185, 129, 0.25)';
          elVerdictTitle.style.color = '#10b981';
          elVerdictTitle.textContent = 'VERDICT: 100% REGISTRY COMPLIANT — NO DISCREPANCY';
          elVerdictSub.textContent = 'Optical vehicle dimensions, classification, and license plate match NIC VAHAN national motor database.';
        }
      }
    }

    // Event Listeners
    if (vehicleSelect) {
      vehicleSelect.addEventListener('change', () => {
        const val = vehicleSelect.value;
        if (val) {
          selectedVehicleId = Number(val);
          updateVehicleInspector();
        }
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        updateCorridorFlowDiff();
        updateVehicleInspector();
        notify('[DIFF RESYNC] Corridor telemetry and optical ANPR buffers synchronized.', 'info');
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const vehicles = getMinimapVehicles();
        const curVeh = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];
        const state = getMinimapState();
        const vahan = curVeh ? getVahanRecord(curVeh) : null;

        const auditContent = [
          '================================================================================',
          'MAHARASHTRA POLICE — VEHICLE INTELLIGENCE & MOVEMENT TRACKING SYSTEM (VIMS)',
          'PUNE CITY ICCC COMMAND CENTRE — AUTOMATED DIFF & AUDIT CERTIFICATE',
          '================================================================================',
          `Generated Timestamp : ${new Date().toISOString()} (IST)`,
          `Junction Node       : JUNC-01 CENTRAL (JM Road - FC Road Arterial)`,
          `Regulation Mode     : ${state ? state.regulationMode : 'ADAPTIVE'}`,
          `Signal Cycle Count  : #${state ? state.cycleCount : 1}`,
          '--------------------------------------------------------------------------------',
          '1. CORRIDOR FLOW DIFFERENTIAL ANALYSIS',
          `   - Corridor 1 (JM Road NS)  : PCU ${state ? state.pcu.NS.toFixed(1) : 0} | Queue ${state ? state.queues.NS : 0}m | Total ${state ? state.totals.NS : 0} units`,
          `   - Corridor 2 (FC Road EW)  : PCU ${state ? state.pcu.EW.toFixed(1) : 0} | Queue ${state ? state.queues.EW : 0}m | Total ${state ? state.totals.EW : 0} units`,
          `   - Corridor PCU Variance    : Δ ${state ? (state.pcu.NS - state.pcu.EW).toFixed(1) : 0} PCU`,
          `   - Signal Priority Bias     : ${state ? state.activeCorridor : 'NS'} CORRIDOR GREEN WAVE`,
          '--------------------------------------------------------------------------------',
          '2. ANPR OPTICAL VS VAHAN REGISTRY DISCREPANCY AUDIT',
          `   - License Plate OCR        : ${curVeh ? curVeh.plate : 'N/A'}`,
          `   - Optical Vehicle Class    : ${curVeh ? curVeh.typeName : 'N/A'}`,
          `   - Registered Model         : ${vahan ? vahan.model : 'N/A'}`,
          `   - Optical Observed Color   : ${curVeh ? curVeh.color : 'N/A'}`,
          `   - Registered Official Color: ${vahan ? vahan.color : 'N/A'}`,
          `   - Engine / Emission Norm   : ${vahan ? vahan.fuel : 'N/A'}`,
          `   - Insurance / Blacklist    : ${vahan ? vahan.insurance : 'N/A'}`,
          `   - Discrepancy Status       : ${vahan && vahan.discrepancy ? vahan.discrepancy.title : '100% REGISTRY COMPLIANT (CLEAN)'}`,
          '================================================================================',
          'AUTHENTICATION HASH: SHA256-' + Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join(''),
          'DISPATCHING AUTHORITY: PUNE CITY TRAFFIC POLICE HEADQUARTERS'
        ].join('\n');

        const blob = new Blob([auditContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pune_anpr_vahan_diff_audit_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notify(`[DIFF AUDIT] Certificate exported for vehicle ${curVeh ? curVeh.plate : 'audit'}.`, 'success');
      });
    }

    // Expose immediate update hook for view lifecycle transition
    refreshDiffAnalysis = () => {
      if (isDiffActive()) {
        updateCorridorFlowDiff();
        updateVehicleInspector();
      }
    };

    // Periodic telemetry update (strictly gates DOM updates to active view state)
    setInterval(() => {
      if (isDiffActive()) {
        updateCorridorFlowDiff();
        updateVehicleInspector();
      }
    }, 1000);

    // Initial run only if active
    if (isDiffActive()) {
      updateCorridorFlowDiff();
      updateVehicleInspector();
    }
  }

})();

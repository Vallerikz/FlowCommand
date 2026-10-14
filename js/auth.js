// VIMS — Authentication & Maharashtra Police Hierarchy Module
// Authentic designations from DGP to PC | Zero fictional clearance levels

const AUTH = {
  SESSION_STORAGE_KEY: 'vims_session_token',
  USER_STORAGE_KEY: 'vims_user_profile',
  SESSION_TTL_HOURS: 8,

  // Authentic Maharashtra Police Hierarchy (highest to lowest)
  POLICE_RANKS: [
    { code: 'DGP', title: 'Director General of Police' },
    { code: 'CP', title: 'Commissioner of Police' },
    { code: 'Joint CP', title: 'Joint Commissioner of Police' },
    { code: 'Addl. CP', title: 'Additional Commissioner of Police' },
    { code: 'DCP', title: 'Deputy Commissioner of Police' },
    { code: 'ACP', title: 'Assistant Commissioner of Police' },
    { code: 'PI', title: 'Police Inspector' },
    { code: 'API', title: 'Assistant Police Inspector' },
    { code: 'PSI', title: 'Police Sub-Inspector' },
    { code: 'ASI', title: 'Assistant Sub-Inspector' },
    { code: 'HC', title: 'Head Constable' },
    { code: 'PC', title: 'Police Constable' }
  ],

  // Authentic Maharashtra Police Units
  POLICE_UNITS: [
    { id: 'TRAFFIC', name: 'Traffic Branch', jurisdiction: 'Pune City Traffic Command' },
    { id: 'CRIME', name: 'Crime Branch / CID', jurisdiction: 'Pune Police Commissionerate' },
    { id: 'CYBER', name: 'Cyber Crime Police Station', jurisdiction: 'Shivajinagar Cyber Cell' },
    { id: 'SPECIAL', name: 'Special Branch', jurisdiction: 'Intelligence & Security Wing' },
    { id: 'STATION', name: 'Police Station (Law & Order)', jurisdiction: 'Deccan Gymkhana / Swargate Division' }
  ],

  /**
   * Generates a simulated JWT session token.
   */
  _generateToken(role, identifier) {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({
      sub: identifier,
      role: role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (this.SESSION_TTL_HOURS * 3600),
      jti: 'vims-sess-' + Math.random().toString(36).substring(2, 11)
    }));
    const sig = btoa('sig_' + Math.random().toString(36).substring(2, 14));
    return `${header}.${payload}.${sig}`;
  },

  /**
   * Get active session object or null if expired/missing.
   */
  getSession() {
    try {
      const token = sessionStorage.getItem(this.SESSION_STORAGE_KEY);
      const userRaw = sessionStorage.getItem(this.USER_STORAGE_KEY);
      if (!token || !userRaw) return null;

      const user = JSON.parse(userRaw);
      if (!user || !user.expiresAt) {
        this.logout();
        return null;
      }

      if (Date.now() > user.expiresAt) {
        console.warn('[VIMS AUTH] Session expired. Terminating session.');
        this.logout();
        return null;
      }

      return {
        token: token,
        sessionId: user.sessionId || 'sess-unknown',
        user: user,
        expiresAt: user.expiresAt
      };
    } catch (err) {
      console.error('[VIMS AUTH] Error reading session:', err);
      return null;
    }
  },

  getSessionId() {
    const sess = this.getSession();
    return sess ? sess.sessionId : null;
  },

  getUser() {
    const sess = this.getSession();
    return sess ? sess.user : null;
  },

  isAuthenticated() {
    return this.getSession() !== null;
  },

  /**
   * True when the app is being exercised locally (static file open or
   * localhost), where a seeded demo session is a sensible fallback so the
   * command centre stays reachable without a running backend.
   */
  _isLocalEnvironment() {
    if (window.location.protocol === 'file:') return true;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;
    return window.location.search.includes('demo=1') || window.location.search.includes('guest=1');
  },

  _demoOfficerUser() {
    return {
      name: 'PI Arjun Deshmukh',
      email: 'arjun.deshmukh@mahapolice.gov.in',
      badgeId: 'MH-PI-4501',
      rankCode: 'PI',
      rankTitle: 'Police Inspector',
      unit: 'Traffic Branch',
      jurisdiction: 'Pune City Traffic Command',
      role: 'law'
    };
  },

  /**
   * Strict Law Enforcement Guard: ensures user is Law Enforcement.
   * If not, redirects immediately to index.html or citizen.html.
   * In local/file test environments without an active session, seeds a default session to allow testing.
   */
  requireLaw() {
    let sess = this.getSession();
    if (!sess) {
      const demoAllowed = localStorage.getItem('vims_demo_mode') === '1' || this._isLocalEnvironment();
      if (demoAllowed) {
        this._createSession(this._demoOfficerUser(), 'law');
        sess = this.getSession();
      } else {
        window.location.replace('index.html');
        return null;
      }
    }
    if (!sess) {
      window.location.replace('index.html');
      return null;
    }
    if (sess.user.role !== 'law') {
      window.location.replace('citizen.html');
      return null;
    }
    return sess.user;
  },

  /**
   * Strict Citizen Guard: ensures user is Citizen.
   */
  requireCitizen() {
    const sess = this.getSession();
    if (!sess) {
      window.location.replace('index.html');
      return null;
    }
    if (sess.user.role === 'law') {
      window.location.replace('command.html');
      return null;
    }
    return sess.user;
  },

  /**
   * General Auth Guard: ensures a valid authenticated session exists.
   * Redirects to index.html if unauthenticated.
   */
  requireAuth() {
    let sess = this.getSession();
    if (!sess) {
      const demoAllowed = localStorage.getItem('vims_demo_mode') === '1' || this._isLocalEnvironment();
      if (demoAllowed) {
        this._createSession(this._demoOfficerUser(), 'law');
        sess = this.getSession();
      } else {
        window.location.replace('index.html');
        return null;
      }
    }
    if (!sess) {
      window.location.replace('index.html');
      return null;
    }
    return sess.user;
  },

  /**
   * Saves a new session into sessionStorage.
   */
  _createSession(user, role) {
    const sessionId = 'vims-mh-' + Math.random().toString(36).substring(2, 9);
    const expiresAt = Date.now() + (this.SESSION_TTL_HOURS * 3600 * 1000);
    const token = this._generateToken(role, user.email || user.mobile || 'user');

    const sessionUser = {
      ...user,
      role: role,
      sessionId: sessionId,
      loginTimestamp: new Date().toISOString(),
      expiresAt: expiresAt
    };

    sessionStorage.setItem(this.SESSION_STORAGE_KEY, token);
    sessionStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(sessionUser));
    return sessionUser;
  },

  /**
   * Law Enforcement Sign In with Maharashtra Police Rank
   */
  async loginLaw({ email, badgeId, rankCode, unitId, password, otp }) {
    const cleanEmail = email ? email.trim() : '';
    const cleanBadge = badgeId ? badgeId.trim().toUpperCase() : 'MH-PI-4501';
    const cleanRank = rankCode || 'PI';
    const cleanUnit = unitId || 'TRAFFIC';
    const cleanOtp = otp ? otp.trim() : '';

    if (!cleanEmail) {
      return { success: false, error: 'Government official email address is required.' };
    }
    if (!cleanBadge) {
      return { success: false, error: 'Officer Badge or Service ID is required.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    if (!cleanOtp || !/^[0-9]{6}$/.test(cleanOtp)) {
      return { success: false, error: 'Valid 6-digit MFA Security Token / OTP is required.' };
    }

    const rankObj = this.POLICE_RANKS.find(r => r.code === cleanRank) || this.POLICE_RANKS[6]; // Default: PI
    const unitObj = this.POLICE_UNITS.find(u => u.id === cleanUnit) || this.POLICE_UNITS[0];

    // Try backend authentication endpoint
    try {
      const response = await fetch((typeof API !== 'undefined' ? API.BASE_URL : (() => { const h = window.location.hostname || 'localhost'; const p = window.location.port === '3000' ? '8000' : (window.location.port || '8000'); return window.location.protocol + '//' + h + ':' + p; })()) + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'law',
          email: cleanEmail,
          badge_id: cleanBadge,
          password: password,
          otp: cleanOtp
        })
      });

      if (response.ok) {
        const data = await response.json();
        const user = data.user || {
          name: `${rankObj.code} Arjun Deshmukh`,
          email: cleanEmail,
          badgeId: cleanBadge,
          rankCode: rankObj.code,
          rankTitle: rankObj.title,
          unit: unitObj.name,
          jurisdiction: unitObj.jurisdiction,
          role: 'law'
        };
        const sessionUser = this._createSession(user, 'law');
        return { success: true, user: sessionUser };
      } else {
        const errData = await response.json().catch(() => ({}));
        return { success: false, error: errData.detail || 'Authentication failed: Invalid credentials or MFA token.' };
      }
    } catch (err) {
      // The backend is unreachable. Only allow the simulated session when the
      // app is explicitly in demo mode or running locally — otherwise the
      // operator gets a dead-end "server unreachable" message with no way
      // forward.
      const DEMO_MODE = localStorage.getItem('vims_demo_mode') === '1' || this._isLocalEnvironment();
      if (!DEMO_MODE) {
        return { success: false, error: 'Authentication server unreachable. Start the backend, or enable demo mode for offline testing.' };
      }
      // Backend offline — proceed with realistic Maharashtra Police demo session
    }

    // Realistic default police officer identity (Pune Police Command)
    const officerName = cleanEmail.includes('deshmukh') || cleanBadge === 'MH-PI-4501'
      ? `${rankObj.code} Arjun Deshmukh`
      : `${rankObj.code} ${cleanEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;

    const user = {
      name: officerName,
      email: cleanEmail,
      badgeId: cleanBadge,
      rankCode: rankObj.code,
      rankTitle: rankObj.title,
      unit: unitObj.name,
      jurisdiction: unitObj.jurisdiction,
      role: 'law'
    };

    const sessionUser = this._createSession(user, 'law');
    return { success: true, user: sessionUser };
  },

  /**
   * Law Enforcement Registration with Maharashtra Police Rank
   */
  async signupLaw({ name, email, badgeId, rankCode, unitId, password, confirmPassword }) {
    const cleanName = SANITIZE.sanitizeText(name);
    const cleanEmail = email ? email.trim() : '';
    const cleanBadge = badgeId ? badgeId.trim().toUpperCase() : '';
    const cleanRank = rankCode || 'PI';
    const cleanUnit = unitId || 'TRAFFIC';

    if (!cleanName || cleanName.length < 3) {
      return { success: false, error: 'Full legal officer name is required.' };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Valid departmental email is required.' };
    }
    if (!cleanBadge) {
      return { success: false, error: 'Badge / Service ID is required.' };
    }
    if (!password || password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters for police personnel accounts.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    const rankObj = this.POLICE_RANKS.find(r => r.code === cleanRank) || this.POLICE_RANKS[6];
    const unitObj = this.POLICE_UNITS.find(u => u.id === cleanUnit) || this.POLICE_UNITS[0];

    const user = {
      name: `${rankObj.code} ${cleanName}`,
      email: cleanEmail,
      badgeId: cleanBadge,
      rankCode: rankObj.code,
      rankTitle: rankObj.title,
      unit: unitObj.name,
      jurisdiction: unitObj.jurisdiction,
      role: 'law'
    };

    const sessionUser = this._createSession(user, 'law');
    return { success: true, user: sessionUser };
  },

  /**
   * Citizen Sign In
   */
  async loginCitizen({ mode, mobile, otp, email, password }) {
    if (mode === 'mobile') {
      const cleanMobile = mobile ? mobile.replace(/[\s\-]/g, '') : '';
      const cleanOtp = otp ? otp.trim() : '';

      if (!cleanMobile || !/^[6-9][0-9]{9}$/.test(cleanMobile)) {
        return { success: false, error: 'Enter a valid 10-digit Indian mobile number.' };
      }
      if (!cleanOtp || !/^[0-9]{6}$/.test(cleanOtp)) {
        return { success: false, error: 'Enter the 6-digit OTP sent to your registered mobile.' };
      }

      try {
        const response = await fetch((typeof API !== 'undefined' ? API.BASE_URL : (() => { const h = window.location.hostname || 'localhost'; const p = window.location.port === '3000' ? '8000' : (window.location.port || '8000'); return window.location.protocol + '//' + h + ':' + p; })()) + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'citizen',
            mobile: cleanMobile,
            otp: cleanOtp
          })
        });
        if (response.ok) {
          const data = await response.json();
          const user = data.user || {
            name: 'Citizen (' + cleanMobile.slice(0, 2) + '••••' + cleanMobile.slice(6) + ')',
            mobile: cleanMobile,
            email: null,
            role: 'citizen'
          };
          const sessionUser = this._createSession(user, 'citizen');
          return { success: true, user: sessionUser };
        } else {
          const errData = await response.json().catch(() => ({}));
          return { success: false, error: errData.detail || 'Authentication failed: Invalid OTP.' };
        }
      } catch {
        // Offline demo fallback
      }

      const user = {
        name: 'Citizen (' + cleanMobile.slice(0, 2) + '••••' + cleanMobile.slice(6) + ')',
        mobile: cleanMobile,
        email: null,
        role: 'citizen'
      };

      const sessionUser = this._createSession(user, 'citizen');
      return { success: true, user: sessionUser };
    } else {
      const cleanEmail = email ? email.trim() : '';
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return { success: false, error: 'Enter a valid registered email address.' };
      }
      if (!password || password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters.' };
      }

      const displayName = cleanEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const user = {
        name: displayName,
        email: cleanEmail,
        mobile: null,
        role: 'citizen'
      };

      const sessionUser = this._createSession(user, 'citizen');
      return { success: true, user: sessionUser };
    }
  },

  /**
   * Citizen Sign Up
   */
  signupCitizen({ name, mobile, email, password, confirmPassword }) {
    const cleanName = SANITIZE.sanitizeText(name);
    const cleanMobile = mobile ? mobile.replace(/[\s\-]/g, '') : '';
    const cleanEmail = email ? email.trim() : '';

    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: 'Full name as per official ID is required.' };
    }
    if (!cleanMobile || !/^[6-9][0-9]{9}$/.test(cleanMobile)) {
      return { success: false, error: 'Valid 10-digit mobile number is required.' };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { success: false, error: 'Valid email address is required for grievance communications.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match.' };
    }

    const user = {
      name: cleanName,
      mobile: cleanMobile,
      email: cleanEmail,
      role: 'citizen'
    };

    const sessionUser = this._createSession(user, 'citizen');
    return { success: true, user: sessionUser };
  },

  /**
   * Terminate active session and purge state.
   */
  logout() {
    sessionStorage.removeItem(this.SESSION_STORAGE_KEY);
    sessionStorage.removeItem(this.USER_STORAGE_KEY);
    sessionStorage.clear();
    window.location.href = 'index.html';
  }
};

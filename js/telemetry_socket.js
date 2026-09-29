// VIMS — Real-Time Telemetry & Alert Stream (WebSocket Client)
// Real-time push alerts with reconnect & autonomous edge fallback

const TELEMETRY_STREAM = {
  // Derived from the page origin so the socket works on any host/port and
  // upgrades to wss:// automatically when the page is served over HTTPS.
  WS_URL: ((window.location.protocol === 'https:' ? 'wss:' : 'ws:') +
    '//' + (window.location.hostname || 'localhost') +
    ':' + (window.location.port === '3000' ? '8000' : (window.location.port || '8000')) +
    '/ws/telemetry'),
  socket: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 2000,
  isConnected: false,
  fallbackTimer: null,
  reconnectTimer: null,
  stableTimer: null,

  listeners: {
    alert: [],
    telemetry: [],
    status: []
  },

  /**
   * Initialize telemetry connection
   */
  connect() {
    // Never open a second socket while one is live or already connecting —
    // otherwise parallel sockets are created and only one is tracked.
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // If browser supports WebSocket
    if (typeof WebSocket === 'undefined') {
      this._startAutonomousSimulation();
      return;
    }

    try {
      this.socket = new WebSocket(this.WS_URL);

      this.socket.onopen = () => {
        this.isConnected = true;
        this._notifyStatus('CONNECTED');
        console.log('[VIMS TELEMETRY] Real-time WebSocket connection established.');
        if (this.fallbackTimer) {
          clearInterval(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        // Only reset the backoff once the socket has actually stayed up.
        // Resetting here would make a server that accepts-then-drops the
        // connection retry forever, since every attempt reaches onopen.
        clearTimeout(this.stableTimer);
        this.stableTimer = setTimeout(() => {
          this.reconnectAttempts = 0;
        }, 10000);
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this._handleMessage(payload);
        } catch (e) {
          console.error('[VIMS TELEMETRY] Failed to parse message:', e);
        }
      };

      this.socket.onerror = (err) => {
        console.warn('[VIMS TELEMETRY] WebSocket encounter, fallback mode active:', err);
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        clearTimeout(this.stableTimer);
        this._notifyStatus('DISCONNECTED');
        this._scheduleReconnect();
      };

    } catch (err) {
      console.warn('[VIMS TELEMETRY] Direct socket init failed, engaging autonomous edge simulation.');
      this._startAutonomousSimulation();
    }
  },

  _scheduleReconnect() {
    // Clear any pending reconnect so a burst of close events can't stack
    // several timers that each open a new socket.
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, delay);
    } else {
      console.log('[VIMS TELEMETRY] Max reconnect attempts reached. Operating on local telemetry feed.');
      this._startAutonomousSimulation();
    }
  },

  /**
   * Tear down the socket and timers. Safe to call more than once.
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.socket) {
      // Drop the handlers first so close() can't schedule a reconnect.
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      this.socket.onopen = null;
      try { this.socket.close(); } catch (_) { /* already closing */ }
      this.socket = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
  },

  _handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ALERT' && this.listeners.alert) {
      this.listeners.alert.forEach(cb => cb(msg.data));
    } else if (msg.type === 'TELEMETRY' && this.listeners.telemetry) {
      this.listeners.telemetry.forEach(cb => cb(msg.data));
    } else if (msg.type === 'STATUS') {
      // Forward the server handshake message to status subscribers so a
      // pending "connecting…" indicator can resolve.
      this._notifyStatus('SERVER_HANDSHAKE');
      if (msg.message && this.listeners.status.length) {
        console.log('[VIMS TELEMETRY]', msg.message);
      }
    }
  },

  /**
   * Autonomous edge simulation when server WebSocket is offline
   */
  _startAutonomousSimulation() {
    if (this.fallbackTimer) return;
    this._notifyStatus('EDGE_LOCAL');

    // Periodic simulation for real-time visual movement without server
    this.fallbackTimer = setInterval(() => {
      const simulatedPlates = ['MH12DE1433', 'DL04CAF5571', 'RJ14TC0012', 'WB26AE9012', 'KA03MM8899', 'TS09UB4521'];
      const cameras = ['CAM-01 (Swargate)', 'CAM-02 (FC Road)', 'CAM-03 (JM Road)', 'CAM-05 (Hinjewadi)', 'CAM-08 (Airport Rd)'];

      const randomPlate = simulatedPlates[Math.floor(Math.random() * simulatedPlates.length)];
      const randomCam = cameras[Math.floor(Math.random() * cameras.length)];
      const isAlert = randomPlate === 'DL04CAF5571' || randomPlate === 'RJ14TC0012';

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

      const telemetryEvent = {
        time: timeStr,
        camera: randomCam.split(' ')[0],
        junction: randomCam.replace(/^[^\(]*\(/, '').replace(/\)$/, ''),
        plate: randomPlate,
        speedKmph: Math.floor(40 + Math.random() * 35),
        confidence: (96 + Math.random() * 3.8).toFixed(1) + '%',
        isAlert: isAlert
      };

      if (this.listeners.telemetry) {
        this.listeners.telemetry.forEach(cb => cb(telemetryEvent));
      }

      if (isAlert && this.listeners.alert) {
        this.listeners.alert.forEach(cb => cb({
          ...telemetryEvent,
          reason: 'Visual attributes mismatch registered VAHAN specifications.'
        }));
      }
    }, 12000);
  },

  onAlert(callback) {
    this.listeners.alert.push(callback);
  },

  onTelemetry(callback) {
    this.listeners.telemetry.push(callback);
  },

  onStatusChange(callback) {
    this.listeners.status.push(callback);
  },

  _notifyStatus(status) {
    this.listeners.status.forEach(cb => cb(status));
  }
};

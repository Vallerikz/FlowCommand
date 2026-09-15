// VIMS — Real-Time Telemetry & Alert Stream (WebSocket Client)
// Real-time push alerts with reconnect & autonomous edge fallback

const TELEMETRY_STREAM = {
  WS_URL: 'ws://localhost:8000/ws/telemetry',
  socket: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  reconnectDelay: 2000,
  isConnected: false,
  fallbackTimer: null,

  listeners: {
    alert: [],
    telemetry: [],
    status: []
  },

  /**
   * Initialize telemetry connection
   */
  connect() {
    // If browser supports WebSocket
    if (typeof WebSocket === 'undefined') {
      this._startAutonomousSimulation();
      return;
    }

    try {
      this.socket = new WebSocket(this.WS_URL);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._notifyStatus('CONNECTED');
        console.log('[VIMS TELEMETRY] Real-time WebSocket connection established.');
        if (this.fallbackTimer) {
          clearInterval(this.fallbackTimer);
          this.fallbackTimer = null;
        }
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
        this._notifyStatus('DISCONNECTED');
        this._scheduleReconnect();
      };

    } catch (err) {
      console.warn('[VIMS TELEMETRY] Direct socket init failed, engaging autonomous edge simulation.');
      this._startAutonomousSimulation();
    }
  },

  _scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      setTimeout(() => this.connect(), delay);
    } else {
      console.log('[VIMS TELEMETRY] Max reconnect attempts reached. Operating on local telemetry feed.');
      this._startAutonomousSimulation();
    }
  },

  _handleMessage(msg) {
    if (msg.type === 'ALERT' && this.listeners.alert) {
      this.listeners.alert.forEach(cb => cb(msg.data));
    } else if (msg.type === 'TELEMETRY' && this.listeners.telemetry) {
      this.listeners.telemetry.forEach(cb => cb(msg.data));
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

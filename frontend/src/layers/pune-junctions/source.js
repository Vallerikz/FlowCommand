/**
 * @fileoverview Network data source for Pune Smart Intersections Telemetry.
 * Connects to the FlowCommand WebSocket stream at 2 Hz.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * WebSocket data source for Pune Smart Intersections telemetry.
 */
export class PuneJunctionsSource {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='ws://localhost:8000/ws/pune-telemetry']
   * @param {number} [options.reconnectIntervalMs=2000]
   * @param {number} [options.maxReconnectIntervalMs=10000]
   */
  constructor(options = {}) {
    const defaultHost = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
    const defaultPort = '8000';
    this.url = options.url || `ws://${defaultHost}:${defaultPort}/ws/pune-telemetry`;
    this.reconnectIntervalMs = options.reconnectIntervalMs || 2000;
    this.maxReconnectIntervalMs = options.maxReconnectIntervalMs || 10000;

    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {boolean} */
    this.isConnected = false;
    /** @type {boolean} */
    this.shouldReconnect = false;
    /** @type {number} */
    this.currentBackoff = this.reconnectIntervalMs;
    /** @type {number|null} */
    this.reconnectTimer = null;
    /** @type {Object|null} */
    this.latestPayload = null;
    /** @type {number} */
    this.lastReceivedTimestamp = 0;
    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  /**
   * Subscribes a listener callback to new telemetry frames.
   * @param {function(Object): void} callback
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
  }

  /**
   * Unsubscribes a listener callback.
   * @param {function(Object): void} callback
   */
  unsubscribe(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Connects to the telemetry WebSocket endpoint.
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.currentBackoff = this.reconnectIntervalMs;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.latestPayload = data;
          this.lastReceivedTimestamp = Date.now();
          for (const listener of this.listeners) {
            listener(data);
          }
        } catch (err) {
          // Ignore parse errors on malformed payloads
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.ws = null;
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules an exponential backoff reconnect attempt.
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, this.currentBackoff);

    this.currentBackoff = Math.min(this.currentBackoff * 1.5, this.maxReconnectIntervalMs);
  }

  /**
   * Disconnects from the WebSocket endpoint and stops auto-reconnect.
   */
  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Safe close ignore
      }
      this.ws = null;
    }
    this.isConnected = false;
  }

  /**
   * Returns the most recent received payload.
   * @returns {Object|null}
   */
  getLatest() {
    return this.latestPayload;
  }

  /**
   * Returns connection status metrics.
   * @returns {{ connected: boolean, lastReceived: number, url: string }}
   */
  getStatus() {
    return {
      connected: this.isConnected,
      lastReceived: this.lastReceivedTimestamp,
      url: this.url
    };
  }
}

export default PuneJunctionsSource;

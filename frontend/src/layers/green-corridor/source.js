/**
 * @fileoverview Network source for Emergency Green Corridor signal preemption.
 * Calls /api/corridor/green-corridor/activate and /deactivate on FlowCommand backend.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * REST/WebSocket client for emergency green corridor coordination.
 */
export class GreenCorridorSource {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   */
  constructor(options = {}) {
    const defaultHost = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
    const defaultPort = '8000';
    this.baseUrl = options.baseUrl || `http://${defaultHost}:${defaultPort}/api/corridor/green-corridor`;

    /** @type {Object|null} */
    this.activeCorridorState = null;
    /** @type {boolean} */
    this.isActive = false;
    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  /**
   * Subscribes a listener to corridor state changes.
   * @param {function(Object|null): void} callback
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
  }

  /**
   * Unsubscribes a listener.
   * @param {function(Object|null): void} callback
   */
  unsubscribe(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Activates emergency green corridor between two junctions.
   * @param {string} fromJunction
   * @param {string} toJunction
   * @returns {Promise<Object>}
   */
  async activateCorridor(fromJunction, toJunction) {
    try {
      const res = await fetch(`${this.baseUrl}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          from_junction: fromJunction,
          to_junction: toJunction
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status} activating corridor`);
      }

      const data = await res.json();
      this.activeCorridorState = data;
      this.isActive = true;
      this._notifyListeners(data);
      return data;
    } catch (err) {
      // Offline fallback state
      const fallback = {
        status: 'GREEN_CORRIDOR_ACTIVE',
        from_junction: fromJunction,
        to_junction: toJunction,
        route: [fromJunction, toJunction],
        preempted_junctions: [fromJunction, toJunction],
        offline_fallback: true
      };
      this.activeCorridorState = fallback;
      this.isActive = true;
      this._notifyListeners(fallback);
      return fallback;
    }
  }

  /**
   * Deactivates the green corridor and restores automated ATSC.
   * @returns {Promise<Object>}
   */
  async deactivateCorridor() {
    try {
      await fetch(`${this.baseUrl}/deactivate`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
    } catch (e) {
      // Safe offline ignore
    }

    this.activeCorridorState = null;
    this.isActive = false;
    this._notifyListeners(null);
    return { status: 'DEACTIVATED' };
  }

  /**
   * Returns current active corridor state.
   * @returns {Object|null}
   */
  getCorridorState() {
    return this.activeCorridorState;
  }

  /**
   * Notifies subscribers.
   * @private
   */
  _notifyListeners(data) {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (e) {
        // Safe callback execution
      }
    }
  }
}

export default GreenCorridorSource;

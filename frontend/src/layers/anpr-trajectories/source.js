/**
 * @fileoverview Network source for ANPR cross-camera trajectory reconstruction.
 * Calls /api/anpr/trajectory/{plate_query} on the FlowCommand backend.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * REST data source for vehicle trajectory GeoJSON.
 */
export class AnprTrajectoriesSource {
  /**
   * @param {Object} [options]
   * @param {string} [options.baseUrl]
   */
  constructor(options = {}) {
    const defaultHost = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
    const defaultPort = '8000';
    this.baseUrl = options.baseUrl || `http://${defaultHost}:${defaultPort}/api/anpr/trajectory`;

    /** @type {Object|null} */
    this.latestFeatureCollection = null;
    /** @type {string|null} */
    this.currentPlateQuery = null;
    /** @type {boolean} */
    this.isLoading = false;
    /** @type {Set<Function>} */
    this.listeners = new Set();
  }

  /**
   * Subscribes a listener to trajectory changes.
   * @param {function(Object): void} callback
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this.listeners.add(callback);
    }
  }

  /**
   * Unsubscribes a listener.
   * @param {function(Object): void} callback
   */
  unsubscribe(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Fetches reconstructed trajectory for a given license plate.
   * @param {string} plateQuery
   * @returns {Promise<Object>} GeoJSON FeatureCollection
   */
  async fetchTrajectory(plateQuery) {
    const cleanPlate = (plateQuery || '').trim().toUpperCase();
    if (!cleanPlate) {
      this.latestFeatureCollection = null;
      this.currentPlateQuery = null;
      this._notifyListeners(null);
      return null;
    }

    this.currentPlateQuery = cleanPlate;
    this.isLoading = true;

    try {
      const url = `${this.baseUrl}/${encodeURIComponent(cleanPlate)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status} reconstructing trajectory`);
      }

      const data = await res.json();
      this.latestFeatureCollection = data;
      this._notifyListeners(data);
      return data;
    } catch (err) {
      this.latestFeatureCollection = null;
      this._notifyListeners(null);
      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Returns latest loaded trajectory GeoJSON.
   * @returns {Object|null}
   */
  getTrajectory() {
    return this.latestFeatureCollection;
  }

  /**
   * Notifies all registered subscribers.
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

export default AnprTrajectoriesSource;

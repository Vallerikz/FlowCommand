/**
 * @fileoverview Layer Controller for Pune Smart Intersections.
 * Coordinates network source, domain records, and CesiumJS renderer.
 *
 * Implements the Unified Layer Interface:
 * - init(context)
 * - enable()
 * - disable()
 * - update(time)
 * - destroy()
 * - getStats()
 * - getDetectableObjects()
 */

'use strict';

import { PuneJunctionsSource } from './source.js';
import { normalizeJunctionPayload } from './records.js';
import { PuneJunctionsRenderer } from './renderer.js';

export class PuneJunctionsController {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.source = new PuneJunctionsSource(options);
    this.renderer = null;
    /** @type {Map<string, import('./records.js').JunctionRecord>} */
    this.records = new Map();

    this.active = false;
    this.context = null;
    this.lastStats = {
      totalCount: 0,
      visibleCount: 0,
      active: false,
      lastUpdated: 0,
      error: null
    };

    this.onTelemetryFrame = this.onTelemetryFrame.bind(this);
  }

  /**
   * Initializes layer with Cesium viewer context.
   * @param {Object} context { viewer, Cesium, ... }
   */
  async init(context) {
    this.context = context;
    this.renderer = new PuneJunctionsRenderer(context);
    this.renderer.init();
    this.source.subscribe(this.onTelemetryFrame);
  }

  /**
   * Internal callback invoked on each WebSocket telemetry tick.
   * @param {Object} rawPayload
   */
  onTelemetryFrame(rawPayload) {
    if (!this.active) return;
    this.records = normalizeJunctionPayload(rawPayload);
    if (this.renderer) {
      this.renderer.render(this.records);
    }
  }

  /**
   * Activates layer and starts telemetry stream.
   */
  enable() {
    this.active = true;
    if (this.renderer) {
      this.renderer.setVisible(true);
    }
    this.source.connect();
    // Render immediately if cached payload exists
    const cached = this.source.getLatest();
    if (cached) {
      this.onTelemetryFrame(cached);
    }
  }

  /**
   * Deactivates layer, pauses stream, hides visual elements.
   */
  disable() {
    this.active = false;
    if (this.renderer) {
      this.renderer.setVisible(false);
    }
    this.source.disconnect();
  }

  /**
   * Per-frame or interval update tick.
   * @param {Object} time Cesium JulianDate or timestamp
   */
  update(time) {
    // If telemetry paused, maintain latest visual frame
    if (!this.active) return;
  }

  /**
   * Full cleanup and resource disposal.
   */
  destroy() {
    this.disable();
    this.source.unsubscribe(this.onTelemetryFrame);
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    this.records.clear();
  }

  /**
   * Telemetry diagnostic metrics for UI / HUD panels.
   * @returns {Object}
   */
  getStats() {
    let sumCongestion = 0;
    for (const r of this.records.values()) {
      sumCongestion += r.congestionScore;
    }
    const avgCongestion = this.records.size > 0 ? (sumCongestion / this.records.size).toFixed(2) : 0;

    return {
      totalCount: this.records.size,
      visibleCount: this.active ? this.records.size : 0,
      active: this.active,
      lastUpdated: this.source.lastReceivedTimestamp,
      avgCongestion: Number(avgCongestion),
      connected: this.source.isConnected,
      error: null
    };
  }

  /**
   * Target detection and HUD targeting interface.
   * Exposes junction entities with world positions and attributes.
   * @returns {Array<Object>}
   */
  getDetectableObjects() {
    if (!this.active || !this.context || !this.context.Cesium) {
      return [];
    }

    const Cesium = this.context.Cesium;
    const objects = [];

    for (const [id, rec] of this.records.entries()) {
      objects.push({
        id: `junction_${id}`,
        name: rec.name,
        category: 'TRAFFIC_INTERSECTION',
        position: Cesium.Cartesian3.fromDegrees(rec.longitude, rec.latitude, rec.height),
        metadata: {
          congestionScore: rec.congestionScore,
          activePhase: rec.activePhase,
          recommendedGreenSec: rec.recommendedGreenSec,
          aiBoostSec: rec.aiBoostSec,
          queueLengthM: rec.queueLengthM,
          avgWaitS: rec.avgWaitS
        }
      });
    }

    return objects;
  }
}

export default PuneJunctionsController;

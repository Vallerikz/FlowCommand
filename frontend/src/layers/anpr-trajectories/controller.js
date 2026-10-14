/**
 * @fileoverview Layer Controller for ANPR vehicle trajectories and camera handoff.
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

import { AnprTrajectoriesSource } from './source.js';
import { TrajectoryRecord } from './records.js';
import { AnprTrajectoriesRenderer } from './renderer.js';

export class AnprTrajectoriesController {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.source = new AnprTrajectoriesSource(options);
    this.renderer = null;

    /** @type {TrajectoryRecord|null} */
    this.trajectory = null;
    this.active = false;
    this.context = null;

    this.onTrajectoryReceived = this.onTrajectoryReceived.bind(this);
  }

  /**
   * Initializes layer with Cesium context.
   * @param {Object} context { viewer, Cesium, ... }
   */
  async init(context) {
    this.context = context;
    this.renderer = new AnprTrajectoriesRenderer(context);
    this.renderer.init();
    this.source.subscribe(this.onTrajectoryReceived);
  }

  /**
   * Internal callback when new trajectory data arrives.
   * @param {Object|null} rawGeojson
   */
  onTrajectoryReceived(rawGeojson) {
    this.trajectory = rawGeojson ? new TrajectoryRecord(rawGeojson) : null;
    if (this.active && this.renderer) {
      this.renderer.render(this.trajectory);
    }
  }

  /**
   * Queries and renders trajectory for an Indian license plate (e.g., MH12DE1433).
   * @param {string} plate
   * @returns {Promise<Object|null>}
   */
  async setPlateQuery(plate) {
    const geojson = await this.source.fetchTrajectory(plate);
    return geojson;
  }

  /**
   * Switches / flies Cesium camera to next downstream CCTV node along road heading vector.
   * Click-to-Track camera handoff contract.
   * @param {string} currentJunctionId
   * @returns {boolean} True if downstream node found and camera dispatched.
   */
  handoffToNextDownstream(currentJunctionId) {
    if (!this.trajectory || !this.renderer) return false;

    const nextFix = this.trajectory.findNextDownstreamFix(currentJunctionId, 500);
    if (nextFix) {
      this.renderer.flyToFix(nextFix.longitude, nextFix.latitude, nextFix.height);
      return true;
    }
    return false;
  }

  /**
   * Activates layer.
   */
  enable() {
    this.active = true;
    if (this.renderer) {
      this.renderer.setVisible(true);
      if (this.trajectory) {
        this.renderer.render(this.trajectory);
      }
    }
    // Default initial query if none set
    if (!this.source.currentPlateQuery) {
      this.setPlateQuery('MH12DE1433');
    }
  }

  /**
   * Deactivates layer.
   */
  disable() {
    this.active = false;
    if (this.renderer) {
      this.renderer.setVisible(false);
    }
  }

  /**
   * Per-frame update tick.
   * @param {Object} time
   */
  update(time) {
    if (!this.active) return;
  }

  /**
   * Full cleanup and disposal.
   */
  destroy() {
    this.disable();
    this.source.unsubscribe(this.onTrajectoryReceived);
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    this.trajectory = null;
  }

  /**
   * Layer diagnostic metrics.
   * @returns {Object}
   */
  getStats() {
    const sightingsCount = this.trajectory ? this.trajectory.sightings.length : 0;
    const confirmedCount = this.trajectory ? this.trajectory.confirmedSegments.length : 0;
    const interpolatedCount = this.trajectory ? this.trajectory.interpolatedSegments.length : 0;

    return {
      active: this.active,
      plateQuery: this.source.currentPlateQuery,
      sightings: sightingsCount,
      confirmedSegments: confirmedCount,
      interpolatedSegments: interpolatedCount,
      error: null
    };
  }

  /**
   * Exposes trajectory fixes for HUD targeting brackets.
   * @returns {Array<Object>}
   */
  getDetectableObjects() {
    if (!this.active || !this.trajectory || !this.context || !this.context.Cesium) {
      return [];
    }

    const Cesium = this.context.Cesium;
    return this.trajectory.sightings.map((fix, idx) => ({
      id: `trajectory_fix_${idx}_${fix.junctionId}`,
      name: `${fix.plateMatched} @ ${fix.junctionName}`,
      category: 'VEHICLE_TRACKING_FIX',
      position: Cesium.Cartesian3.fromDegrees(fix.longitude, fix.latitude, fix.height),
      metadata: {
        plate: fix.plateMatched,
        speedKmh: fix.speedKmh,
        confidence: fix.ocrConfidence,
        timestamp: fix.timestamp,
        isInterpolated: fix.isInterpolated
      }
    }));
  }
}

export default AnprTrajectoriesController;

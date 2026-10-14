/**
 * @fileoverview Layer Controller for Pune Smart CCTV Cameras.
 * Coordinates network source, records, and Cesium viewshed renderer.
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

import { PuneCctvSource } from './source.js';
import { normalizeCameraPack } from './records.js';
import { PuneCctvRenderer } from './renderer.js';

export class PuneCctvController {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.source = new PuneCctvSource(options);
    this.renderer = null;
    /** @type {Map<string, import('./records.js').CameraRecord>} */
    this.cameras = new Map();

    this.active = false;
    this.context = null;

    this.onCamerasFetched = this.onCamerasFetched.bind(this);
  }

  /**
   * Initializes layer with Cesium context.
   * @param {Object} context { viewer, Cesium, ... }
   */
  async init(context) {
    this.context = context;
    this.renderer = new PuneCctvRenderer(context);
    this.renderer.init();
    this.source.subscribe(this.onCamerasFetched);
  }

  /**
   * Internal callback when camera pack is fetched.
   * @param {Array<Object>} rawList
   */
  onCamerasFetched(rawList) {
    this.cameras = normalizeCameraPack(rawList);
    if (this.active && this.renderer) {
      this.renderer.render(this.cameras);
    }
  }

  /**
   * Activates layer and loads camera metadata.
   */
  enable() {
    this.active = true;
    if (this.renderer) {
      this.renderer.setVisible(true);
    }
    this.source.startPolling();
    if (this.cameras.size > 0 && this.renderer) {
      this.renderer.render(this.cameras);
    }
  }

  /**
   * Deactivates layer and hides viewshed cones.
   */
  disable() {
    this.active = false;
    if (this.renderer) {
      this.renderer.setVisible(false);
    }
    this.source.stopPolling();
  }

  /**
   * Per-frame update tick.
   * @param {Object} time
   */
  update(time) {
    if (!this.active) return;
  }

  /**
   * Calibrates pose parameters for a specific camera in real-time.
   * Interactive calibration gizmo hook.
   * @param {string} cameraId
   * @param {number} headingDeg
   * @param {number} pitchDeg
   * @param {number} fovDeg
   */
  calibrateCameraPose(cameraId, headingDeg, pitchDeg, fovDeg) {
    const cam = this.cameras.get(cameraId);
    if (cam) {
      cam.updatePose(headingDeg, pitchDeg, fovDeg);
      if (this.renderer) {
        this.renderer.selectCamera(cameraId);
        this.renderer.render(this.cameras);
      }
    }
  }

  /**
   * Full cleanup and disposal.
   */
  destroy() {
    this.disable();
    this.source.unsubscribe(this.onCamerasFetched);
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    this.cameras.clear();
  }

  /**
   * Layer diagnostic metrics.
   * @returns {Object}
   */
  getStats() {
    return {
      totalCount: this.cameras.size,
      visibleCount: this.active ? this.cameras.size : 0,
      active: this.active,
      lastUpdated: this.source.lastFetched,
      viewshedsActive: this.active ? this.cameras.size : 0,
      error: null
    };
  }

  /**
   * Exposes camera targets for targeting brackets and selection.
   * @returns {Array<Object>}
   */
  getDetectableObjects() {
    if (!this.active || !this.context || !this.context.Cesium) {
      return [];
    }

    const Cesium = this.context.Cesium;
    const objects = [];

    for (const [id, cam] of this.cameras.entries()) {
      objects.push({
        id: `cctv_${id}`,
        name: `${cam.junctionName} — ${cam.approach} [${cam.role}]`,
        category: 'SURVEILLANCE_CAMERA',
        position: Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, cam.height),
        metadata: {
          approach: cam.approach,
          role: cam.role,
          heading: cam.headingDeg,
          pitch: cam.pitchDeg,
          fov: cam.fovDeg
        }
      });
    }

    return objects;
  }
}

export default PuneCctvController;

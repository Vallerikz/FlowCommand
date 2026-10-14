/**
 * @fileoverview Layer Controller for Emergency Green Corridor & Road Cordons.
 * Coordinates route preemption, vehicle animation, and whiteboard perimeter calculation.
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

import { GreenCorridorSource } from './source.js';
import { GreenCorridorRecord } from './records.js';
import { GreenCorridorRenderer } from './renderer.js';

export class GreenCorridorController {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this.source = new GreenCorridorSource(options);
    this.renderer = null;

    /** @type {GreenCorridorRecord|null} */
    this.corridorRecord = null;
    this.active = false;
    this.context = null;

    // Hardcoded Pune intersection coordinates for route fallback
    this.junctionCoordinates = {
      'university_chowk': [73.8296, 18.5413, 562],
      'swargate_jedhe_chowk': [73.8569, 18.5008, 568],
      'nal_stop_chowk': [73.8267, 18.5091, 565],
      'chandni_chowk': [73.7797, 18.5065, 610],
      'katraj_naka': [73.8572, 18.4526, 612],
      'hinjewadi_shivaji_chowk': [73.7389, 18.5912, 574],
      'deccan_gymkhana': [73.8415, 18.5167, 561],
      'sancheti_chowk': [73.8512, 18.5284, 558]
    };

    this.onCorridorStateChanged = this.onCorridorStateChanged.bind(this);
  }

  /**
   * Initializes layer with Cesium context.
   * @param {Object} context { viewer, Cesium, ... }
   */
  async init(context) {
    this.context = context;
    this.renderer = new GreenCorridorRenderer(context);
    this.renderer.init();
    this.source.subscribe(this.onCorridorStateChanged);
  }

  /**
   * Internal callback when corridor state activates or deactivates.
   * @param {Object|null} rawState
   */
  onCorridorStateChanged(rawState) {
    if (!rawState) {
      this.corridorRecord = null;
      if (this.renderer) {
        this.renderer.renderCorridor(null);
        this.renderer.updateVehiclePosition(null);
      }
      return;
    }

    this.corridorRecord = new GreenCorridorRecord(rawState);

    // Build 3D waypoints for corridor route
    const waypoints = [];
    for (const jid of this.corridorRecord.route) {
      const c = this.junctionCoordinates[jid];
      if (c) waypoints.push(c);
    }

    // Default route if empty
    if (waypoints.length < 2) {
      waypoints.push(
        this.junctionCoordinates['hinjewadi_shivaji_chowk'],
        this.junctionCoordinates['university_chowk'],
        this.junctionCoordinates['sancheti_chowk'],
        this.junctionCoordinates['deccan_gymkhana']
      );
    }

    this.corridorRecord.setRouteWaypoints(waypoints);

    if (this.active && this.renderer) {
      this.renderer.renderCorridor(this.corridorRecord);
    }
  }

  /**
   * Activates emergency green corridor between two junctions.
   * @param {string} fromJunction
   * @param {string} toJunction
   */
  async activateCorridor(fromJunction, toJunction) {
    return await this.source.activateCorridor(fromJunction, toJunction);
  }

  /**
   * Deactivates the green corridor.
   */
  async deactivateCorridor() {
    return await this.source.deactivateCorridor();
  }

  /**
   * Whiteboard polygon tool integration: receives a drawn polygon cordon
   * and recalculates perimeter congestion.
   * @param {Array<[number, number]>} polygonVertices [[lon, lat], ...]
   * @returns {{ cordonedCount: number, avgPerimeterCongestion: number }}
   */
  handleWhiteboardPolygon(polygonVertices) {
    const junctionsList = Object.entries(this.junctionCoordinates).map(([id, coords]) => ({
      id,
      name: id,
      coords: [coords[0], coords[1]],
      congestion: 0.65
    }));

    const result = GreenCorridorRecord.recalculateCordonCongestion(polygonVertices, junctionsList);

    if (this.renderer) {
      this.renderer.renderCordonPolygon(polygonVertices, result.avgPerimeterCongestion);
    }

    return result;
  }

  /**
   * Activates layer.
   */
  enable() {
    this.active = true;
    if (this.renderer) {
      this.renderer.setVisible(true);
      if (this.corridorRecord) {
        this.renderer.renderCorridor(this.corridorRecord);
      }
    }
    // Default demo corridor if none active
    if (!this.corridorRecord) {
      this.activateCorridor('hinjewadi_shivaji_chowk', 'deccan_gymkhana');
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
   * Per-frame update tick: steps moving emergency vehicle position.
   * @param {Object} time
   */
  update(time) {
    if (!this.active || !this.corridorRecord || !this.renderer) return;

    const pos = this.corridorRecord.stepVehicle(0.016); // ~60 FPS step
    this.renderer.updateVehiclePosition(pos);
  }

  /**
   * Full cleanup and disposal.
   */
  destroy() {
    this.disable();
    this.source.unsubscribe(this.onCorridorStateChanged);
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = null;
    }
    this.corridorRecord = null;
  }

  /**
   * Layer diagnostic metrics.
   * @returns {Object}
   */
  getStats() {
    return {
      active: this.active,
      corridorActive: this.source.isActive,
      fromJunction: this.corridorRecord ? this.corridorRecord.fromJunction : null,
      toJunction: this.corridorRecord ? this.corridorRecord.toJunction : null,
      preemptedCount: this.corridorRecord ? this.corridorRecord.preemptedJunctions.length : 0,
      error: null
    };
  }

  /**
   * Exposes emergency vehicle and preempted nodes for targeting.
   * @returns {Array<Object>}
   */
  getDetectableObjects() {
    if (!this.active || !this.context || !this.context.Cesium || !this.corridorRecord) {
      return [];
    }

    const Cesium = this.context.Cesium;
    const objects = [];

    if (this.corridorRecord.routeWaypoints.length > 0) {
      const cur = this.corridorRecord.routeWaypoints[0];
      objects.push({
        id: 'emergency_vehicle_amb_01',
        name: 'AMBULANCE-108 [PRIORITY GREEN WAVE]',
        category: 'EMERGENCY_VEHICLE',
        position: Cesium.Cartesian3.fromDegrees(cur[0], cur[1], (cur[2] || 560) + 4.0),
        metadata: {
          status: 'CODE_RED',
          speedKmh: this.corridorRecord.vehicleSpeedKmh,
          route: this.corridorRecord.route
        }
      });
    }

    return objects;
  }
}

export default GreenCorridorController;

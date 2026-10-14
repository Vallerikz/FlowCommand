/**
 * @fileoverview Domain model for Emergency Green Corridors and Road Cordon Perimeters.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * Point-in-polygon test (ray casting algorithm).
 * @param {[number, number]} point [lon, lat]
 * @param {Array<[number, number]>} polygon Array of [lon, lat]
 * @returns {boolean}
 */
export function isPointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Emergency Green Corridor state record.
 */
export class GreenCorridorRecord {
  /**
   * @param {Object} raw Raw corridor activation state.
   */
  constructor(raw = {}) {
    this.status = String(raw.status || 'INACTIVE');
    this.fromJunction = String(raw.from_junction || '');
    this.toJunction = String(raw.to_junction || '');
    this.route = Array.isArray(raw.route) ? raw.route.map(String) : [];
    this.preemptedJunctions = Array.isArray(raw.preempted_junctions) ? raw.preempted_junctions.map(String) : [];
    this.activatedAt = raw.activated_at || Date.now();

    /** @type {number} Normalized progress [0..1] along corridor route */
    this.vehicleProgress = 0.0;
    this.vehicleSpeedKmh = 65.0;

    /** @type {Array<[number, number, number]>} Full route coordinates [[lon, lat, height], ...] */
    this.routeWaypoints = [];
  }

  /**
   * Sets route 3D coordinates.
   * @param {Array<[number, number, number]>} waypoints
   */
  setRouteWaypoints(waypoints) {
    this.routeWaypoints = Array.isArray(waypoints) ? waypoints : [];
  }

  /**
   * Updates simulated emergency vehicle position along route.
   * @param {number} deltaTimeSec Time step in seconds
   * @returns {[number, number, number]|null} Current vehicle position
   */
  stepVehicle(deltaTimeSec = 1.0) {
    if (this.routeWaypoints.length < 2) return null;

    // Advance progress (total route loop in ~60 seconds)
    this.vehicleProgress = (this.vehicleProgress + (deltaTimeSec / 60.0)) % 1.0;

    const totalSegs = this.routeWaypoints.length - 1;
    const globalPos = this.vehicleProgress * totalSegs;
    const segIdx = Math.min(Math.floor(globalPos), totalSegs - 1);
    const localFrac = globalPos - segIdx;

    const p0 = this.routeWaypoints[segIdx];
    const p1 = this.routeWaypoints[segIdx + 1];

    return [
      p0[0] + (p1[0] - p0[0]) * localFrac,
      p0[1] + (p1[1] - p0[1]) * localFrac,
      (p0[2] || 560.0) + ((p1[2] || 560.0) - (p0[2] || 560.0)) * localFrac + 3.0
    ];
  }

  /**
   * Recalculates perimeter congestion during road cordons / whiteboard polygon drawn areas.
   * Identifies intersections enclosed or bordering the cordon polygon.
   * @param {Array<[number, number]>} polygonVertices [[lon, lat], ...]
   * @param {Array<{ id: string, name: string, coords: [number, number], congestion: number }>} allJunctions
   * @returns {{ cordonedCount: number, avgPerimeterCongestion: number, cordonedJunctions: Array<string> }}
   */
  static recalculateCordonCongestion(polygonVertices, allJunctions) {
    if (!polygonVertices || polygonVertices.length < 3 || !Array.isArray(allJunctions)) {
      return { cordonedCount: 0, avgPerimeterCongestion: 0, cordonedJunctions: [] };
    }

    const cordoned = [];
    let sumScore = 0;

    for (const junc of allJunctions) {
      if (isPointInPolygon(junc.coords, polygonVertices)) {
        cordoned.push(junc.id);
        sumScore += Number(junc.congestion || 0.5);
      }
    }

    const avg = cordoned.length > 0 ? Number((sumScore / cordoned.length).toFixed(2)) : 0;
    return {
      cordonedCount: cordoned.length,
      avgPerimeterCongestion: avg,
      cordonedJunctions: cordoned
    };
  }
}

export default {
  isPointInPolygon,
  GreenCorridorRecord
};

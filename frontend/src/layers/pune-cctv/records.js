/**
 * @fileoverview Domain model and pose calculation for Pune CCTV cameras.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * Normalized camera record with orientation, frustum bounds, and stream metadata.
 */
export class CameraRecord {
  /**
   * @param {Object} raw Raw camera metadata object.
   */
  constructor(raw = {}) {
    this.id = String(raw.id || 'camera_0');
    this.junctionId = String(raw.junction_id || 'unknown');
    this.junctionName = String(raw.junction_name || this.junctionId);
    this.approach = String(raw.approach || 'N');
    this.role = String(raw.role || 'ANPR');
    this.status = String(raw.status || 'ONLINE').toUpperCase();
    this.feedUrl = String(raw.feed_url || '');

    const coords = Array.isArray(raw.coordinates_wgs84) ? raw.coordinates_wgs84 : [73.8567, 18.5204, 560];
    this.longitude = Number(coords[0] || 73.8567);
    this.latitude = Number(coords[1] || 18.5204);
    this.height = Number(coords[2] || 560.0);

    const pose = raw.pose || {};
    this.headingDeg = Number(pose.heading_deg !== undefined ? pose.heading_deg : 0.0);
    this.pitchDeg = Number(pose.pitch_deg !== undefined ? pose.pitch_deg : -20.0);
    this.fovDeg = Number(pose.fov_deg !== undefined ? pose.fov_deg : 50.0);
    this.heightM = Number(pose.height_m !== undefined ? pose.height_m : 7.5);

    // Range of view cone in metres
    this.rangeM = this.role === 'PTZ_OVERVIEW' ? 140.0 : 80.0;
  }

  /**
   * Updates camera pose (e.g., from calibration gizmo).
   * @param {number} heading
   * @param {number} pitch
   * @param {number} fov
   */
  updatePose(heading, pitch, fov) {
    if (heading !== undefined) this.headingDeg = ((heading % 360) + 360) % 360;
    if (pitch !== undefined) this.pitchDeg = Math.max(-89.0, Math.min(89.0, pitch));
    if (fov !== undefined) this.fovDeg = Math.max(15.0, Math.min(120.0, fov));
  }

  /**
   * Calculates viewshed perimeter points (frustum footprint on ground) using planar geodesy approximation.
   * @returns {Array<[number, number, number]>} Array of [lon, lat, height] vertices.
   */
  computeViewshedPolygon() {
    const origin = [this.longitude, this.latitude, this.height];
    const headingRad = (this.headingDeg * Math.PI) / 180.0;
    const halfFovRad = ((this.fovDeg / 2.0) * Math.PI) / 180.0;
    const pitchRad = (Math.abs(this.pitchDeg) * Math.PI) / 180.0;

    // Slant ground projection distance
    const groundDist = this.rangeM * Math.cos(pitchRad);

    const numArcPoints = 7;
    const arcPoints = [];

    for (let i = 0; i < numArcPoints; i++) {
      const angleFraction = i / (numArcPoints - 1); // 0 to 1
      const currentAngle = (headingRad - halfFovRad) + (angleFraction * halfFovRad * 2.0);

      // Metres to degrees approximation for Pune latitude (~18.5 deg)
      const dNorth = groundDist * Math.cos(currentAngle);
      const dEast = groundDist * Math.sin(currentAngle);

      const latOffset = dNorth / 111320.0;
      const lonOffset = dEast / (111320.0 * Math.cos((this.latitude * Math.PI) / 180.0));

      arcPoints.push([
        this.longitude + lonOffset,
        this.latitude + latOffset,
        Math.max(0, this.height - this.heightM)
      ]);
    }

    return [origin, ...arcPoints, origin];
  }
}

/**
 * Normalizes camera pack list into map of records.
 * @param {Array<Object>} rawList
 * @returns {Map<string, CameraRecord>}
 */
export function normalizeCameraPack(rawList) {
  const map = new Map();
  if (!Array.isArray(rawList)) return map;

  for (const item of rawList) {
    if (item && item.id) {
      const rec = new CameraRecord(item);
      map.set(rec.id, rec);
    }
  }
  return map;
}

export default {
  CameraRecord,
  normalizeCameraPack
};

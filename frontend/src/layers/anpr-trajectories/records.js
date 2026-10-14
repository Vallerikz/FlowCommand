/**
 * @fileoverview Domain model and segment normalizers for ANPR vehicle trajectories.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * Camera sighting fix point.
 */
export class SightingFix {
  constructor(feature = {}) {
    const geom = feature.geometry || {};
    const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [0, 0, 0];
    const props = feature.properties || {};

    this.longitude = Number(coords[0] || 0);
    this.latitude = Number(coords[1] || 0);
    this.height = Number(coords[2] || 0);

    this.junctionId = String(props.junction_id || '');
    this.junctionName = String(props.name || this.junctionId);
    this.plateRaw = String(props.plate_raw || '');
    this.plateMatched = String(props.plate_matched || '');
    this.ocrConfidence = Number(props.ocr_confidence || 0);
    this.timestamp = String(props.timestamp || '');
    this.speedKmh = Number(props.speed_kmh || 0);
    this.vehicleClass = String(props.vehicle_class || 'Car');
    this.isInterpolated = props.feature_kind === 'interpolated_fix';
  }
}

/**
 * Trajectory road path segment.
 */
export class TrajectorySegment {
  constructor(feature = {}) {
    const geom = feature.geometry || {};
    const coords = Array.isArray(geom.coordinates) ? geom.coordinates : [];
    const props = feature.properties || {};

    this.coordinates = coords.map(c => [Number(c[0]), Number(c[1]), Number(c[2] || 0)]);
    this.segmentType = String(props.segment_type || 'confirmed'); // 'confirmed' | 'interpolated'
    this.fromJunction = String(props.from_junction || '');
    this.toJunction = String(props.to_junction || '');
    this.distanceM = Number(props.distance_m || 0);
    this.velocityKmh = Number(props.v_kmh || 0);
    this.tStart = String(props.t_start || '');
    this.tEnd = String(props.t_end || '');
  }

  isConfirmed() {
    return this.segmentType === 'confirmed';
  }
}

/**
 * Parsed trajectory record containing all fixes and segments.
 */
export class TrajectoryRecord {
  /**
   * @param {Object} geojson GeoJSON FeatureCollection
   */
  constructor(geojson = {}) {
    this.plateQuery = (geojson.properties && geojson.properties.plate_query) || '';
    this.plateNormalized = (geojson.properties && geojson.properties.plate_normalized) || '';

    /** @type {Array<SightingFix>} */
    this.sightings = [];
    /** @type {Array<TrajectorySegment>} */
    this.confirmedSegments = [];
    /** @type {Array<TrajectorySegment>} */
    this.interpolatedSegments = [];

    const features = Array.isArray(geojson.features) ? geojson.features : [];

    for (const f of features) {
      const kind = f.properties && f.properties.feature_kind;
      if (kind === 'camera_sighting' || kind === 'interpolated_fix') {
        this.sightings.push(new SightingFix(f));
      } else if (kind === 'trajectory_segment') {
        const seg = new TrajectorySegment(f);
        if (seg.isConfirmed()) {
          this.confirmedSegments.push(seg);
        } else {
          this.interpolatedSegments.push(seg);
        }
      }
    }
  }

  /**
   * Finds the downstream CCTV camera / intersection fix within maxDistanceM (default 500m).
   * @param {string} currentJunctionId
   * @param {number} [maxDistanceM=500]
   * @returns {SightingFix|null}
   */
  findNextDownstreamFix(currentJunctionId, maxDistanceM = 500) {
    const idx = this.sightings.findIndex(s => s.junctionId === currentJunctionId);
    if (idx >= 0 && idx < this.sightings.length - 1) {
      return this.sightings[idx + 1];
    }
    return null;
  }
}

export default {
  SightingFix,
  TrajectorySegment,
  TrajectoryRecord
};

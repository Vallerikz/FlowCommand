/**
 * @fileoverview Domain model and record normalizers for Pune Smart Intersections.
 *
 * Invariant: Pure JavaScript ES module with ZERO CesiumJS dependencies.
 */

'use strict';

/**
 * Normalized immutable representation of a smart intersection state snapshot.
 */
export class JunctionRecord {
  /**
   * @param {Object} raw Raw junction payload from WebSocket or REST.
   */
  constructor(raw = {}) {
    this.junctionId = String(raw.junction_id || raw.id || 'unknown');
    this.name = String(raw.name || raw.local_name || this.junctionId);

    const coords = Array.isArray(raw.coordinates_wgs84) ? raw.coordinates_wgs84 : [73.8567, 18.5204, 560];
    this.longitude = Number(coords[0] || 73.8567);
    this.latitude = Number(coords[1] || 18.5204);
    this.height = Number(coords[2] || 560.0);

    this.congestionScore = Math.max(0.0, Math.min(1.0, Number(raw.congestion_score || 0.0)));
    this.activePhase = String(raw.active_phase || 'NS').toUpperCase();
    this.recommendedGreenSec = Math.max(15, Math.min(90, Math.round(Number(raw.recommended_green_sec || 30))));
    this.aiBoostSec = Math.max(0, Math.round(Number(raw.ai_boost_sec || 0)));
    this.iotActuationAck = Boolean(raw.iot_actuation_ack);
    this.fallbackMode = Boolean(raw.fallback_mode);

    this.vehicleCounts = raw.vehicle_counts ? Object.assign({}, raw.vehicle_counts) : {};
    this.queueLengthM = Math.max(0.0, Number(raw.queue_length_m || 0.0));
    this.avgWaitS = Math.max(0.0, Number(raw.avg_wait_s || 0.0));
    this.lastUpdated = raw.last_updated ? Number(raw.last_updated) : Date.now();
    this.anprHits = Array.isArray(raw.anpr_hits) ? raw.anpr_hits : [];
  }

  /**
   * Generates display label text for the 3D signal countdown totem.
   * Format: "N-S GREEN 45s (+8s AI)"
   * @returns {string}
   */
  getTotemLabel() {
    const phaseLabel = this.activePhase === 'PREEMPT_EMERGENCY'
      ? 'EMERGENCY PREEMPT'
      : (this.activePhase === 'EW' ? 'E-W GREEN' : 'N-S GREEN');

    const boostText = this.aiBoostSec > 0 ? ` (+${this.aiBoostSec}s AI)` : '';
    return `${phaseLabel} ${this.recommendedGreenSec}s${boostText}`;
  }

  /**
   * Congestion categorization.
   * @returns {'CLEAR'|'MODERATE'|'CONGESTED'|'GRIDLOCK'}
   */
  getCongestionCategory() {
    if (this.congestionScore >= 0.8) return 'GRIDLOCK';
    if (this.congestionScore >= 0.6) return 'CONGESTED';
    if (this.congestionScore >= 0.35) return 'MODERATE';
    return 'CLEAR';
  }

  /**
   * Hex color corresponding to congestion level.
   * @returns {string}
   */
  getCongestionHex() {
    if (this.activePhase === 'PREEMPT_EMERGENCY') return '#00E5FF'; // Cyan emergency override
    if (this.congestionScore >= 0.8) return '#FF2244';
    if (this.congestionScore >= 0.6) return '#FF6600';
    if (this.congestionScore >= 0.35) return '#FFCC00';
    return '#00FF88';
  }
}

/**
 * Normalizes a telemetry broadcast payload into a map of junction records.
 * @param {Object} payload Raw JSON from WebSocket.
 * @returns {Map<string, JunctionRecord>}
 */
export function normalizeJunctionPayload(payload) {
  const records = new Map();
  if (!payload || !Array.isArray(payload.junctions)) {
    return records;
  }

  for (const raw of payload.junctions) {
    if (raw && (raw.junction_id || raw.id)) {
      const rec = new JunctionRecord(raw);
      records.set(rec.junctionId, rec);
    }
  }

  return records;
}

export default {
  JunctionRecord,
  normalizeJunctionPayload
};

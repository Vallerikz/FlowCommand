/**
 * @fileoverview CesiumJS renderer for cross-camera ANPR vehicle trajectories.
 * Renders solid cyan paths for confirmed hops, dashed amber for interpolated blind spots.
 *
 * Invariant: Encapsulates all WebGL and CesiumJS primitive resources.
 */

'use strict';

/**
 * Visual renderer for multi-camera vehicle trajectories.
 */
export class AnprTrajectoriesRenderer {
  /**
   * @param {Object} context Viewer context containing Cesium and viewer instances.
   */
  constructor(context = {}) {
    this.Cesium = context.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
    this.viewer = context.viewer || null;
    this.scene = this.viewer ? this.viewer.scene : null;

    /** @type {Object|null} Cesium.PolylineCollection */
    this.polylines = null;
    /** @type {Object|null} Cesium.PointPrimitiveCollection */
    this.points = null;
    /** @type {Object|null} Cesium.LabelCollection */
    this.labels = null;

    this.visible = false;
  }

  /**
   * Initializes Cesium primitive collections.
   */
  init() {
    if (!this.Cesium || !this.scene) return;

    this.polylines = this.scene.primitives.add(new this.Cesium.PolylineCollection());
    this.points = this.scene.primitives.add(new this.Cesium.PointPrimitiveCollection());
    this.labels = this.scene.primitives.add(new this.Cesium.LabelCollection());

    this.polylines.show = false;
    this.points.show = false;
    this.labels.show = false;
  }

  /**
   * Toggles visibility.
   * @param {boolean} show
   */
  setVisible(show) {
    this.visible = !!show;
    if (this.polylines) this.polylines.show = this.visible;
    if (this.points) this.points.show = this.visible;
    if (this.labels) this.labels.show = this.visible;
  }

  /**
   * Renders trajectory fixes and paths.
   * @param {import('./records.js').TrajectoryRecord|null} trajectory
   */
  render(trajectory) {
    if (!this.Cesium || !this.polylines || !this.points || !this.labels) return;

    this.polylines.removeAll();
    this.points.removeAll();
    this.labels.removeAll();

    if (!trajectory) return;

    const Cesium = this.Cesium;

    // 1. Confirmed Segments (Solid Cyan Polyline, 3px)
    for (const seg of trajectory.confirmedSegments) {
      if (seg.coordinates.length >= 2) {
        const positions = seg.coordinates.map(c =>
          Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2] + 4.0)
        );
        this.polylines.add({
          positions: positions,
          width: 3.5,
          material: Cesium.Material.fromType('Color', {
            color: Cesium.Color.CYAN.withAlpha(0.95)
          })
        });
      }
    }

    // 2. Interpolated Blind-Spot Segments (Dashed Amber Polyline)
    for (const seg of trajectory.interpolatedSegments) {
      if (seg.coordinates.length >= 2) {
        const positions = seg.coordinates.map(c =>
          Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2] + 4.0)
        );
        this.polylines.add({
          positions: positions,
          width: 2.5,
          material: Cesium.Material.fromType('PolylineDash', {
            color: Cesium.Color.fromCssColorString('#FFB347'),
            gapColor: Cesium.Color.TRANSPARENT,
            dashLength: 16.0
          })
        });
      }
    }

    // 3. Sighting Fix Points & Labels
    for (const fix of trajectory.sightings) {
      const pos = Cesium.Cartesian3.fromDegrees(fix.longitude, fix.latitude, fix.height + 6.0);
      const isInterpolated = fix.isInterpolated;

      this.points.add({
        position: pos,
        pixelSize: isInterpolated ? 8 : 12,
        color: isInterpolated ? Cesium.Color.fromCssColorString('#FFB347') : Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      });

      const fixLabel = isInterpolated
        ? `[ESTIMATED FIX] ${fix.junctionName}`
        : `[MATCH ${Math.round(fix.ocrConfidence * 100)}%] ${fix.plateMatched}\n${fix.junctionName} · ${fix.speedKmh.toFixed(0)} km/h`;

      this.labels.add({
        position: pos,
        text: fixLabel,
        font: 'bold 11px monospace',
        fillColor: isInterpolated ? Cesium.Color.fromCssColorString('#FFB347') : Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.06, 0.08, 0.12, 0.85),
        disableDepthTestDistance: 50000.0,
        scaleByDistance: new Cesium.NearFarScalar(1.0e2, 1.0, 1.0e5, 0.4)
      });
    }
  }

  /**
   * Smoothly animates / flies camera to target coordinates (for click-to-track handoff).
   * @param {number} lon
   * @param {number} lat
   * @param {number} height
   */
  flyToFix(lon, lat, height) {
    if (!this.viewer || !this.Cesium) return;
    this.viewer.camera.flyTo({
      destination: this.Cesium.Cartesian3.fromDegrees(lon, lat, height + 180.0),
      orientation: {
        heading: this.Cesium.Math.toRadians(0),
        pitch: this.Cesium.Math.toRadians(-45.0),
        roll: 0.0
      },
      duration: 1.5
    });
  }

  /**
   * WebGL cleanup.
   */
  destroy() {
    if (this.scene && !this.scene.isDestroyed()) {
      if (this.polylines) {
        this.scene.primitives.remove(this.polylines);
        this.polylines = null;
      }
      if (this.points) {
        this.scene.primitives.remove(this.points);
        this.points = null;
      }
      if (this.labels) {
        this.scene.primitives.remove(this.labels);
        this.labels = null;
      }
    }
  }
}

export default AnprTrajectoriesRenderer;

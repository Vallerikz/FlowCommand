/**
 * @fileoverview CesiumJS visual renderer for Pune Smart Intersections.
 * Owns Cesium PointPrimitiveCollection, LabelCollection, and visual primitives.
 *
 * Invariant: Encapsulates all WebGL/CesiumJS rendering calls and lifecycle.
 */

'use strict';

/**
 * Visual renderer for Pune junction nodes and 3D signal countdown totems.
 */
export class PuneJunctionsRenderer {
  /**
   * @param {Object} context Viewer context containing Cesium and viewer instances.
   */
  constructor(context = {}) {
    this.Cesium = context.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
    this.viewer = context.viewer || null;
    this.scene = this.viewer ? this.viewer.scene : null;

    /** @type {Object|null} Cesium.PointPrimitiveCollection */
    this.points = null;
    /** @type {Object|null} Cesium.LabelCollection */
    this.labels = null;

    // Internal maps: junctionId -> Primitive references
    this.pointPrimitives = new Map();
    this.labelPrimitives = new Map();

    this.visible = false;
  }

  /**
   * Initializes primitive collections and binds them to the Cesium scene.
   */
  init() {
    if (!this.Cesium || !this.scene) {
      return;
    }

    this.points = this.scene.primitives.add(new this.Cesium.PointPrimitiveCollection());
    this.labels = this.scene.primitives.add(new this.Cesium.LabelCollection());

    this.points.show = false;
    this.labels.show = false;
  }

  /**
   * Sets visibility of all primitives in this layer.
   * @param {boolean} show
   */
  setVisible(show) {
    this.visible = !!show;
    if (this.points) this.points.show = this.visible;
    if (this.labels) this.labels.show = this.visible;
  }

  /**
   * Updates rendering with new junction records.
   * @param {Map<string, import('./records.js').JunctionRecord>} records
   */
  render(records) {
    if (!this.Cesium || !this.points || !this.labels) {
      return;
    }

    const seenIds = new Set();

    for (const [jid, rec] of records.entries()) {
      seenIds.add(jid);

      const position = this.Cesium.Cartesian3.fromDegrees(
        rec.longitude,
        rec.latitude,
        rec.height
      );

      // Elevated totem position for 3D label
      const totemPosition = this.Cesium.Cartesian3.fromDegrees(
        rec.longitude,
        rec.latitude,
        rec.height + 22.0
      );

      const color = this.Cesium.Color.fromCssColorString(rec.getCongestionHex());

      // 1. Point Primitive (Junction Center Marker)
      let point = this.pointPrimitives.get(jid);
      if (!point) {
        point = this.points.add({
          position: position,
          pixelSize: 14,
          color: color,
          outlineColor: this.Cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        });
        this.pointPrimitives.set(jid, point);
      } else {
        point.position = position;
        point.color = color;
        point.pixelSize = Math.round(12 + rec.congestionScore * 8);
      }

      // 2. 3D Countdown Totem Label
      let label = this.labelPrimitives.get(jid);
      const labelText = `${rec.name}\n${rec.getTotemLabel()}`;

      if (!label) {
        label = this.labels.add({
          position: totemPosition,
          text: labelText,
          font: 'bold 12px "JetBrains Mono", Consolas, monospace',
          fillColor: color,
          outlineColor: this.Cesium.Color.BLACK,
          outlineWidth: 3,
          style: this.Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: this.Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: this.Cesium.HorizontalOrigin.CENTER,
          pixelOffset: new this.Cesium.Cartesian2(0, -6),
          backgroundColor: new this.Cesium.Color(0.06, 0.08, 0.12, 0.85),
          showBackground: true,
          backgroundPadding: new this.Cesium.Cartesian2(6, 4),
          disableDepthTestDistance: 50000.0,
          scaleByDistance: new this.Cesium.NearFarScalar(1.5e2, 1.0, 1.5e5, 0.4)
        });
        this.labelPrimitives.set(jid, label);
      } else {
        label.position = totemPosition;
        label.text = labelText;
        label.fillColor = color;
      }
    }

    // Remove pruned / missing junctions
    for (const [jid, point] of this.pointPrimitives.entries()) {
      if (!seenIds.has(jid)) {
        this.points.remove(point);
        this.pointPrimitives.delete(jid);
      }
    }
    for (const [jid, label] of this.labelPrimitives.entries()) {
      if (!seenIds.has(jid)) {
        this.labels.remove(label);
        this.labelPrimitives.delete(jid);
      }
    }
  }

  /**
   * Cleans up WebGL resources and removes primitives from Cesium scene.
   */
  destroy() {
    if (this.scene && !this.scene.isDestroyed()) {
      if (this.points) {
        this.scene.primitives.remove(this.points);
        this.points = null;
      }
      if (this.labels) {
        this.scene.primitives.remove(this.labels);
        this.labels = null;
      }
    }
    this.pointPrimitives.clear();
    this.labelPrimitives.clear();
  }
}

export default PuneJunctionsRenderer;

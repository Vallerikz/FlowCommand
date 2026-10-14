/**
 * @fileoverview CesiumJS renderer for Emergency Green Corridor and Whiteboard Road Cordons.
 * Renders pulsing green glow routes, preempted junction rings, moving vehicle, and cordon polygons.
 *
 * Invariant: Encapsulates all WebGL and CesiumJS resources for this layer.
 */

'use strict';

/**
 * Visual renderer for emergency green corridors.
 */
export class GreenCorridorRenderer {
  /**
   * @param {Object} context Viewer context containing Cesium and viewer instances.
   */
  constructor(context = {}) {
    this.Cesium = context.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
    this.viewer = context.viewer || null;
    this.scene = this.viewer ? this.viewer.scene : null;

    /** @type {Object|null} Cesium.PolylineCollection */
    this.corridorPolylines = null;
    /** @type {Object|null} Cesium.PointPrimitiveCollection */
    this.ringPoints = null;
    /** @type {Object|null} Cesium.PointPrimitiveCollection */
    this.vehiclePoints = null;
    /** @type {Object|null} Cesium.LabelCollection */
    this.labels = null;

    // Entity for road cordon whiteboard polygon
    this.cordonEntity = null;

    this.visible = false;
  }

  /**
   * Initializes Cesium primitive collections.
   */
  init() {
    if (!this.Cesium || !this.scene) return;

    this.corridorPolylines = this.scene.primitives.add(new this.Cesium.PolylineCollection());
    this.ringPoints = this.scene.primitives.add(new this.Cesium.PointPrimitiveCollection());
    this.vehiclePoints = this.scene.primitives.add(new this.Cesium.PointPrimitiveCollection());
    this.labels = this.scene.primitives.add(new this.Cesium.LabelCollection());

    this.corridorPolylines.show = false;
    this.ringPoints.show = false;
    this.vehiclePoints.show = false;
    this.labels.show = false;
  }

  /**
   * Sets visibility.
   * @param {boolean} show
   */
  setVisible(show) {
    this.visible = !!show;
    if (this.corridorPolylines) this.corridorPolylines.show = this.visible;
    if (this.ringPoints) this.ringPoints.show = this.visible;
    if (this.vehiclePoints) this.vehiclePoints.show = this.visible;
    if (this.labels) this.labels.show = this.visible;
    if (this.cordonEntity) this.cordonEntity.show = this.visible;
  }

  /**
   * Renders the active emergency green corridor.
   * @param {import('./records.js').GreenCorridorRecord|null} record
   */
  renderCorridor(record) {
    if (!this.Cesium || !this.corridorPolylines) return;

    this.corridorPolylines.removeAll();
    this.ringPoints.removeAll();
    this.labels.removeAll();

    if (!record || record.routeWaypoints.length < 2) return;

    const Cesium = this.Cesium;
    const cartesianPositions = record.routeWaypoints.map(w =>
      Cesium.Cartesian3.fromDegrees(w[0], w[1], (w[2] || 560.0) + 5.0)
    );

    // 1. Pulsing Green Glow Polyline
    this.corridorPolylines.add({
      positions: cartesianPositions,
      width: 7.0,
      material: Cesium.Material.fromType('PolylineGlow', {
        glowPower: 0.35,
        taperPower: 0.9,
        color: Cesium.Color.fromCssColorString('#00FF66')
      })
    });

    // 2. Preempted Junction Green Rings
    for (const w of record.routeWaypoints) {
      const ringPos = Cesium.Cartesian3.fromDegrees(w[0], w[1], (w[2] || 560.0) + 8.0);
      this.ringPoints.add({
        position: ringPos,
        pixelSize: 22,
        color: Cesium.Color.fromCssColorString('#00FF66').withAlpha(0.35),
        outlineColor: Cesium.Color.fromCssColorString('#00FF66'),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      });

      this.labels.add({
        position: ringPos,
        text: 'PREEMPT [GREEN WAVE]',
        font: 'bold 10px monospace',
        fillColor: Cesium.Color.fromCssColorString('#00FF66'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        showBackground: true,
        backgroundColor: new Cesium.Color(0.04, 0.12, 0.06, 0.85),
        disableDepthTestDistance: 50000.0,
        scaleByDistance: new Cesium.NearFarScalar(1.0e2, 1.0, 1.0e5, 0.4)
      });
    }
  }

  /**
   * Updates moving position of the emergency vehicle.
   * @param {[number, number, number]|null} position [lon, lat, height]
   */
  updateVehiclePosition(position) {
    if (!this.Cesium || !this.vehiclePoints) return;
    this.vehiclePoints.removeAll();

    if (!position) return;

    const Cesium = this.Cesium;
    const cartesianPos = Cesium.Cartesian3.fromDegrees(position[0], position[1], position[2]);

    this.vehiclePoints.add({
      position: cartesianPos,
      pixelSize: 18,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    });
  }

  /**
   * Renders a whiteboard drawn road cordon polygon with calculated perimeter stats.
   * @param {Array<[number, number]>} vertices [[lon, lat], ...]
   * @param {number} perimeterCongestion
   */
  renderCordonPolygon(vertices, perimeterCongestion = 0.5) {
    if (!this.Cesium || !this.viewer) return;

    if (this.cordonEntity) {
      this.viewer.entities.remove(this.cordonEntity);
      this.cordonEntity = null;
    }

    if (!vertices || vertices.length < 3) return;

    const Cesium = this.Cesium;
    const cartesianHierarchy = vertices.map(v => Cesium.Cartesian3.fromDegrees(v[0], v[1], 560.0));

    this.cordonEntity = this.viewer.entities.add({
      show: this.visible,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(cartesianHierarchy),
        material: Cesium.Color.RED.withAlpha(0.20),
        outline: true,
        outlineColor: Cesium.Color.ORANGE,
        outlineWidth: 3
      }
    });
  }

  /**
   * WebGL resource cleanup.
   */
  destroy() {
    if (this.scene && !this.scene.isDestroyed()) {
      if (this.corridorPolylines) {
        this.scene.primitives.remove(this.corridorPolylines);
        this.corridorPolylines = null;
      }
      if (this.ringPoints) {
        this.scene.primitives.remove(this.ringPoints);
        this.ringPoints = null;
      }
      if (this.vehiclePoints) {
        this.scene.primitives.remove(this.vehiclePoints);
        this.vehiclePoints = null;
      }
      if (this.labels) {
        this.scene.primitives.remove(this.labels);
        this.labels = null;
      }
    }

    if (this.viewer && this.viewer.entities && this.cordonEntity) {
      this.viewer.entities.remove(this.cordonEntity);
      this.cordonEntity = null;
    }
  }
}

export default GreenCorridorRenderer;

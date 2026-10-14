/**
 * @fileoverview CesiumJS renderer for Pune CCTV cameras and 3D VIEWSHED visibility cones.
 * Renders camera markers, 3D viewshed cones, occlusion blind spots, and calibration gizmo.
 *
 * Invariant: Encapsulates all WebGL/CesiumJS resources for this layer.
 */

'use strict';

/**
 * Visual renderer for CCTV viewshed frustums and pose calibration gizmo.
 */
export class PuneCctvRenderer {
  /**
   * @param {Object} context Viewer context containing Cesium and viewer instances.
   */
  constructor(context = {}) {
    this.Cesium = context.Cesium || (typeof window !== 'undefined' ? window.Cesium : null);
    this.viewer = context.viewer || null;
    this.scene = this.viewer ? this.viewer.scene : null;

    /** @type {Object|null} Cesium.PointPrimitiveCollection */
    this.cameraPoints = null;
    /** @type {Object|null} Cesium.LabelCollection */
    this.cameraLabels = null;
    /** @type {Object|null} Cesium.PolylineCollection */
    this.frustumPolylines = null;

    // Entities used for filled translucent cones
    this.coneEntities = new Map();

    /** @type {string|null} */
    this.selectedCameraId = null;
    this.visible = false;
  }

  /**
   * Initializes Cesium primitive collections.
   */
  init() {
    if (!this.Cesium || !this.scene) return;

    this.cameraPoints = this.scene.primitives.add(new this.Cesium.PointPrimitiveCollection());
    this.cameraLabels = this.scene.primitives.add(new this.Cesium.LabelCollection());
    this.frustumPolylines = this.scene.primitives.add(new this.Cesium.PolylineCollection());

    this.cameraPoints.show = false;
    this.cameraLabels.show = false;
    this.frustumPolylines.show = false;
  }

  /**
   * Toggles visibility.
   * @param {boolean} show
   */
  setVisible(show) {
    this.visible = !!show;
    if (this.cameraPoints) this.cameraPoints.show = this.visible;
    if (this.cameraLabels) this.cameraLabels.show = this.visible;
    if (this.frustumPolylines) this.frustumPolylines.show = this.visible;

    for (const entity of this.coneEntities.values()) {
      entity.show = this.visible;
    }
  }

  /**
   * Selects a camera for active calibration gizmo display.
   * @param {string|null} cameraId
   */
  selectCamera(cameraId) {
    this.selectedCameraId = cameraId;
  }

  /**
   * Renders camera markers, 3D viewshed cones, and blind spot boundaries.
   * @param {Map<string, import('./records.js').CameraRecord>} cameras
   */
  render(cameras) {
    if (!this.Cesium || !this.cameraPoints || !this.frustumPolylines) return;

    this.cameraPoints.removeAll();
    this.cameraLabels.removeAll();
    this.frustumPolylines.removeAll();

    // Clear old cone entities
    if (this.viewer && this.viewer.entities) {
      for (const ent of this.coneEntities.values()) {
        this.viewer.entities.remove(ent);
      }
    }
    this.coneEntities.clear();

    const Cesium = this.Cesium;

    for (const [id, cam] of cameras.entries()) {
      const isSelected = this.selectedCameraId === id;
      const camPos = Cesium.Cartesian3.fromDegrees(cam.longitude, cam.latitude, cam.height);

      // 1. Camera Point Marker
      this.cameraPoints.add({
        position: camPos,
        pixelSize: isSelected ? 12 : 8,
        color: isSelected ? Cesium.Color.YELLOW : Cesium.Color.AQUA,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      });

      // 2. Camera Label & Calibration Gizmo Text
      let labelText = `${cam.id} [${cam.role}]`;
      if (isSelected) {
        labelText += `\nCALIBRATION: H:${cam.headingDeg.toFixed(1)}° P:${cam.pitchDeg.toFixed(1)}° FOV:${cam.fovDeg.toFixed(1)}°`;
      }

      this.cameraLabels.add({
        position: camPos,
        text: labelText,
        font: isSelected ? 'bold 12px monospace' : '10px monospace',
        fillColor: isSelected ? Cesium.Color.YELLOW : Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -8),
        showBackground: isSelected,
        backgroundColor: new Cesium.Color(0.08, 0.12, 0.18, 0.85),
        disableDepthTestDistance: 10000.0,
        scaleByDistance: new Cesium.NearFarScalar(1.0e2, 1.0, 1.0e5, 0.3)
      });

      // 3. Viewshed Frustum Rays (Polyline cone edges)
      const footprint = cam.computeViewshedPolygon();
      const cartesianFootprint = footprint.map(coord =>
        Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2])
      );

      // Edge wireframe
      this.frustumPolylines.add({
        positions: cartesianFootprint,
        width: isSelected ? 2.5 : 1.5,
        material: Cesium.Material.fromType('Color', {
          color: isSelected ? Cesium.Color.YELLOW.withAlpha(0.85) : Cesium.Color.CYAN.withAlpha(0.65)
        })
      });

      // 4. Viewshed Ground Footprint Translucent Fill
      if (this.viewer && this.viewer.entities) {
        const coneEntity = this.viewer.entities.add({
          show: this.visible,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(cartesianFootprint),
            material: isSelected
              ? Cesium.Color.YELLOW.withAlpha(0.22)
              : Cesium.Color.CYAN.withAlpha(0.12),
            perPositionHeight: true,
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.4)
          }
        });
        this.coneEntities.set(id, coneEntity);
      }
    }
  }

  /**
   * WebGL cleanup.
   */
  destroy() {
    if (this.scene && !this.scene.isDestroyed()) {
      if (this.cameraPoints) {
        this.scene.primitives.remove(this.cameraPoints);
        this.cameraPoints = null;
      }
      if (this.cameraLabels) {
        this.scene.primitives.remove(this.cameraLabels);
        this.cameraLabels = null;
      }
      if (this.frustumPolylines) {
        this.scene.primitives.remove(this.frustumPolylines);
        this.frustumPolylines = null;
      }
    }

    if (this.viewer && this.viewer.entities) {
      for (const ent of this.coneEntities.values()) {
        this.viewer.entities.remove(ent);
      }
    }
    this.coneEntities.clear();
  }
}

export default PuneCctvRenderer;

/**
 * @fileoverview Pune CCTV Viewshed & Occlusion Layer for gods-eye-view CesiumJS console.
 * SIH26127: Intelligent Traffic Management System for Urban India.
 */

'use strict';

import { PuneCctvController } from './controller.js';

/**
 * Layer factory conforming to the gods-eye-view layer architecture.
 * @param {Object} [options]
 * @returns {PuneCctvController}
 */
export function createLayer(options = {}) {
  return new PuneCctvController(options);
}

export { PuneCctvController } from './controller.js';
export { PuneCctvSource } from './source.js';
export { CameraRecord } from './records.js';
export { PuneCctvRenderer } from './renderer.js';

export default {
  id: 'pune-cctv',
  name: 'Pune CCTV Viewsheds',
  category: 'SURVEILLANCE',
  createLayer
};

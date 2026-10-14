/**
 * @fileoverview Emergency Green Corridor & Road Cordon Layer for gods-eye-view CesiumJS console.
 * SIH26127: Intelligent Traffic Management System for Urban India.
 */

'use strict';

import { GreenCorridorController } from './controller.js';

/**
 * Layer factory conforming to the gods-eye-view layer architecture.
 * @param {Object} [options]
 * @returns {GreenCorridorController}
 */
export function createLayer(options = {}) {
  return new GreenCorridorController(options);
}

export { GreenCorridorController } from './controller.js';
export { GreenCorridorSource } from './source.js';
export { GreenCorridorRecord, isPointInPolygon } from './records.js';
export { GreenCorridorRenderer } from './renderer.js';

export default {
  id: 'green-corridor',
  name: 'Emergency Green Corridor',
  category: 'EMERGENCY',
  createLayer
};

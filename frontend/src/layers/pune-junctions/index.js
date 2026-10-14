/**
 * @fileoverview Pune Smart Intersections Layer for gods-eye-view CesiumJS console.
 * SIH26127: Intelligent Traffic Management System for Urban India.
 */

'use strict';

import { PuneJunctionsController } from './controller.js';

/**
 * Layer factory conforming to the gods-eye-view layer architecture.
 * @param {Object} [options]
 * @returns {PuneJunctionsController}
 */
export function createLayer(options = {}) {
  return new PuneJunctionsController(options);
}

export { PuneJunctionsController } from './controller.js';
export { PuneJunctionsSource } from './source.js';
export { JunctionRecord } from './records.js';
export { PuneJunctionsRenderer } from './renderer.js';

export default {
  id: 'pune-junctions',
  name: 'Pune Smart Intersections',
  category: 'TRAFFIC',
  createLayer
};

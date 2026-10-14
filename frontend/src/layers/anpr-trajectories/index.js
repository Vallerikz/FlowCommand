/**
 * @fileoverview ANPR Trajectories Layer for gods-eye-view CesiumJS console.
 * SIH26127: Intelligent Traffic Management System for Urban India.
 */

'use strict';

import { AnprTrajectoriesController } from './controller.js';

/**
 * Layer factory conforming to the gods-eye-view layer architecture.
 * @param {Object} [options]
 * @returns {AnprTrajectoriesController}
 */
export function createLayer(options = {}) {
  return new AnprTrajectoriesController(options);
}

export { AnprTrajectoriesController } from './controller.js';
export { AnprTrajectoriesSource } from './source.js';
export { TrajectoryRecord, SightingFix, TrajectorySegment } from './records.js';
export { AnprTrajectoriesRenderer } from './renderer.js';

export default {
  id: 'anpr-trajectories',
  name: 'ANPR Vehicle Trajectories',
  category: 'VEHICLE_TRACKING',
  createLayer
};

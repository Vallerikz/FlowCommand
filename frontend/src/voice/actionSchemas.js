/**
 * @fileoverview Canonical action parameter schemas for FlowCommand SIH26127 spatial agent voice tools.
 *
 * Invariant: Vanilla JS ES module, 2-space indent, single quotes, semicolons.
 */

'use strict';

/**
 * Canonical JSON schemas for FlowCommand voice actions.
 * @type {Array<Object>}
 */
export const FLOWCOMMAND_ACTION_SCHEMAS = [
  {
    name: 'trace_license_plate',
    description: 'Traces a vehicle license plate across Pune smart intersection cameras and displays the reconstructed trajectory on the 3D globe.',
    parameters: {
      type: 'object',
      properties: {
        plate: {
          type: 'string',
          description: 'Indian RTO license plate number, e.g. MH12DE1433 or MH14EU4092'
        }
      },
      required: ['plate']
    }
  },
  {
    name: 'override_junction_signal',
    description: 'Overrides the traffic signal at a specified Pune junction to a given phase for a set duration.',
    parameters: {
      type: 'object',
      properties: {
        junction_id: {
          type: 'string',
          description: 'Identifier of the junction, e.g. university_chowk, swargate_jedhe_chowk, sancheti_chowk'
        },
        phase: {
          type: 'string',
          enum: ['NS', 'EW', 'PREEMPT_EMERGENCY'],
          description: 'Signal phase to activate: NS, EW, or PREEMPT_EMERGENCY'
        },
        duration_sec: {
          type: 'number',
          minimum: 15,
          maximum: 90,
          description: 'Duration of the override in seconds (15 to 90 seconds)'
        }
      },
      required: ['junction_id', 'phase']
    }
  },
  {
    name: 'activate_green_corridor',
    description: 'Activates a green corridor preempting all downstream junction signals between two Pune intersections for emergency vehicle passage.',
    parameters: {
      type: 'object',
      properties: {
        from_junction: {
          type: 'string',
          description: 'Origin smart intersection, e.g. hinjewadi_shivaji_chowk'
        },
        to_junction: {
          type: 'string',
          description: 'Destination smart intersection, e.g. deccan_gymkhana'
        }
      },
      required: ['from_junction', 'to_junction']
    }
  },
  {
    name: 'get_corridor_congestion_report',
    description: 'Returns a congestion report with PCU load, queue lengths, and wait times for all junctions along a named Pune traffic corridor.',
    parameters: {
      type: 'object',
      properties: {
        corridor_name: {
          type: 'string',
          description: 'Name of the traffic corridor, e.g. "FC Road", "Karve Road", "Satara Road", or "Ganeshkhind"'
        }
      },
      required: ['corridor_name']
    }
  }
];

export default {
  FLOWCOMMAND_ACTION_SCHEMAS
};

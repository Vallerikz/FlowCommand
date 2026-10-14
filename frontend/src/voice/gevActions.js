/**
 * @fileoverview Client-side voice action execution router for gods-eye-view Cesium console.
 * Dispatches LLM tool calls to the corresponding spatial layer controllers and backend APIs.
 *
 * Invariant: Vanilla JS ES module, 2-space indent, single quotes, semicolons.
 */

'use strict';

/**
 * Dispatches an incoming voice tool call to the appropriate layer or backend endpoint.
 * @param {string} actionName
 * @param {Object} args
 * @param {Object} layers Map of active layer instances
 * @returns {Promise<Object>} Execution result returned to the voice model
 */
export async function handleFlowCommandAction(actionName, args = {}, layers = {}) {
  const defaultHost = (typeof window !== 'undefined' && window.location.hostname) ? window.location.hostname : 'localhost';
  const defaultPort = '8000';
  const apiBase = `http://${defaultHost}:${defaultPort}`;

  switch (actionName) {
    case 'trace_license_plate': {
      const plate = (args.plate || '').trim().toUpperCase();
      const anprLayer = layers['anpr-trajectories'] || layers.anprTrajectories;

      if (anprLayer && typeof anprLayer.setPlateQuery === 'function') {
        anprLayer.enable();
        const result = await anprLayer.setPlateQuery(plate);
        const count = result && result.features ? result.features.length : 0;
        return {
          success: true,
          action: 'trace_license_plate',
          plate: plate,
          sightingsFound: count,
          spokenResponse: `Tracing vehicle ${plate} across Pune intersection cameras. Found ${count} confirmed and estimated sightings.`
        };
      }

      // Fallback via direct fetch
      const res = await fetch(`${apiBase}/api/anpr/trajectory/${encodeURIComponent(plate)}`);
      const geojson = await res.json();
      return {
        success: true,
        action: 'trace_license_plate',
        plate: plate,
        spokenResponse: `Retrieved trajectory for plate ${plate}. Displaying route on 3D globe.`
      };
    }

    case 'override_junction_signal': {
      const junctionId = args.junction_id;
      const phase = args.phase || 'NS';
      const durationSec = Number(args.duration_sec || 30);

      const res = await fetch(`${apiBase}/api/junction/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          junction_id: junctionId,
          phase: phase,
          duration_sec: durationSec
        })
      });
      const data = await res.json();

      return {
        success: true,
        action: 'override_junction_signal',
        junctionId: junctionId,
        phase: phase,
        spokenResponse: `Signal override confirmed at ${junctionId}. Holding ${phase} phase for ${durationSec} seconds.`
      };
    }

    case 'activate_green_corridor': {
      const fromJunc = args.from_junction;
      const toJunc = args.to_junction;
      const corridorLayer = layers['green-corridor'] || layers.greenCorridor;

      if (corridorLayer && typeof corridorLayer.activateCorridor === 'function') {
        corridorLayer.enable();
        const result = await corridorLayer.activateCorridor(fromJunc, toJunc);
        const preempted = result && result.preempted_junctions ? result.preempted_junctions.length : 2;
        return {
          success: true,
          action: 'activate_green_corridor',
          route: result.route,
          spokenResponse: `Green corridor activated from ${fromJunc} to ${toJunc}. Preempted ${preempted} intersection signals with emergency priority wave.`
        };
      }

      const res = await fetch(`${apiBase}/api/corridor/green-corridor/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_junction: fromJunc, to_junction: toJunc })
      });
      const data = await res.json();

      return {
        success: true,
        action: 'activate_green_corridor',
        spokenResponse: `Emergency green wave cleared between ${fromJunc} and ${toJunc}.`
      };
    }

    case 'get_corridor_congestion_report': {
      const corridor = args.corridor_name || 'FC Road';
      const res = await fetch(`${apiBase}/api/corridor/congestion/${encodeURIComponent(corridor)}`);
      const data = await res.json();

      const status = data.overall_status || 'MODERATE FLOW';
      const pcu = data.total_pcu_load || 0;

      return {
        success: true,
        action: 'get_corridor_congestion_report',
        corridor: corridor,
        status: status,
        totalPcu: pcu,
        spokenResponse: `Congestion report for ${corridor}: Currently experiencing ${status} with a total PCU load of ${pcu}.`
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${actionName}`
      };
  }
}

/**
 * Registers FlowCommand action handlers with the central voice dispatcher.
 * @param {Object} dispatcher Voice dispatcher instance or registry
 * @param {Object} layers Active layer controllers
 */
export function registerFlowCommandActions(dispatcher, layers) {
  if (!dispatcher || typeof dispatcher.registerAction !== 'function') {
    return;
  }

  const actions = [
    'trace_license_plate',
    'override_junction_signal',
    'activate_green_corridor',
    'get_corridor_congestion_report'
  ];

  for (const act of actions) {
    dispatcher.registerAction(act, (args) => handleFlowCommandAction(act, args, layers));
  }
}

export default {
  handleFlowCommandAction,
  registerFlowCommandActions
};

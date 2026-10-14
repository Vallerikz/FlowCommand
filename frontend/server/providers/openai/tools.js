/**
 * @fileoverview OpenAI Realtime function tool declarations for FlowCommand spatial voice control.
 *
 * Invariant: Vanilla JS ES module, 2-space indent, single quotes, semicolons.
 */

'use strict';

import { FLOWCOMMAND_ACTION_SCHEMAS } from '../../../src/voice/actionSchemas.js';

/**
 * Maps canonical schemas to OpenAI Realtime tool specifications.
 * @type {Array<Object>}
 */
export const FLOWCOMMAND_TOOLS = FLOWCOMMAND_ACTION_SCHEMAS.map(schema => ({
  type: 'function',
  name: schema.name,
  description: schema.description,
  parameters: schema.parameters
}));

export default {
  FLOWCOMMAND_TOOLS
};

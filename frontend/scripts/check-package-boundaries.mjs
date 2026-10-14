/**
 * @fileoverview Package boundary and export integrity verification.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const layersDir = path.join(rootDir, 'src', 'layers');
const requiredLayers = ['pune-junctions', 'pune-cctv', 'anpr-trajectories', 'green-corridor'];
const requiredFiles = ['source.js', 'records.js', 'renderer.js', 'controller.js', 'index.js'];

let errors = 0;

for (const layer of requiredLayers) {
  const layerPath = path.join(layersDir, layer);
  if (!fs.existsSync(layerPath)) {
    console.error(`[PACKAGE ERROR] Missing layer directory: src/layers/${layer}`);
    errors++;
    continue;
  }

  for (const reqFile of requiredFiles) {
    const filePath = path.join(layerPath, reqFile);
    if (!fs.existsSync(filePath)) {
      console.error(`[PACKAGE ERROR] Layer ${layer} missing required component: ${reqFile}`);
      errors++;
    }
  }

  // Verify index.js exports createLayer
  const indexPath = path.join(layerPath, 'index.js');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    if (!indexContent.includes('export function createLayer') && !indexContent.includes('export const createLayer')) {
      console.error(`[PACKAGE ERROR] Layer ${layer}/index.js does not export createLayer()`);
      errors++;
    }
  }
}

// Verify voice actions
const voiceFiles = [
  path.join(rootDir, 'src', 'voice', 'actionSchemas.js'),
  path.join(rootDir, 'src', 'voice', 'gevActions.js'),
  path.join(rootDir, 'server', 'providers', 'openai', 'tools.js')
];

for (const vf of voiceFiles) {
  if (!fs.existsSync(vf)) {
    console.error(`[PACKAGE ERROR] Missing voice tool file: ${path.relative(rootDir, vf)}`);
    errors++;
  }
}

// Verify UI split
const splitFile = path.join(rootDir, 'src', 'ui', 'imagerySplit.js');
if (!fs.existsSync(splitFile)) {
  console.error('[PACKAGE ERROR] Missing UI split comparison: src/ui/imagerySplit.js');
  errors++;
}

if (errors > 0) {
  console.error(`\n[CHECK FAILED] Found ${errors} package boundary error(s).`);
  process.exit(1);
}

console.log('[CHECK PASSED] All layer packages, exports, and voice tools satisfy boundary contracts.');
process.exit(0);

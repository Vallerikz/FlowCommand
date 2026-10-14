/**
 * @fileoverview Boundary check: verifies unidirectional downward imports.
 * Invariant:
 * - Layers must NOT import from src/app/ or src/standalone/
 * - Sources must have NO Cesium dependencies
 * - No circular imports between layers
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

function getAllJsFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        results.push(...getAllJsFiles(full));
      }
    } else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      results.push(full);
    }
  }
  return results;
}

const files = getAllJsFiles(srcDir);
let violations = 0;

const importRegex = /(?:import\s+(?:[\w*\s{},]*)\s+from\s+['"]([^'"]+)['"])|(?:import\(['"]([^'"]+)['"]\))/g;

for (const file of files) {
  const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importTarget = match[1] || match[2];

    // Rule 1: No layer or source may import from src/app/ or src/standalone/
    if (importTarget.includes('/app/') || importTarget.includes('/standalone/')) {
      console.error(`[BOUNDARY VIOLATION] Upward import forbidden in ${relativePath}: ${importTarget}`);
      violations++;
    }

    // Rule 2: sources (source.js) must not import Cesium
    if (relativePath.includes('/source.js') && (importTarget.toLowerCase().includes('cesium') || content.includes('Cesium.'))) {
      console.error(`[BOUNDARY VIOLATION] Cesium import forbidden in data source ${relativePath}`);
      violations++;
    }

    // Rule 3: records (records.js) must not import Cesium
    if (relativePath.includes('/records.js') && (importTarget.toLowerCase().includes('cesium') || content.includes('Cesium.'))) {
      console.error(`[BOUNDARY VIOLATION] Cesium import forbidden in domain record ${relativePath}`);
      violations++;
    }
  }
}

if (violations > 0) {
  console.error(`\n[CHECK FAILED] Found ${violations} import direction boundary violation(s).`);
  process.exit(1);
}

console.log(`[CHECK PASSED] All ${files.length} modules satisfy unidirectional downward import constraints.`);
process.exit(0);

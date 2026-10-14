/**
 * @fileoverview Formatting runner and checker for gods-eye-view source tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWrite = process.argv.includes('--write');
const isCheck = process.argv.includes('--check');

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

const targetDirs = [path.join(rootDir, 'src'), path.join(rootDir, 'server')];
const protectedFiles = new Set([
  path.normalize(path.join(rootDir, 'src', 'styles', 'claheNightShader.js')),
]);
const files = targetDirs.flatMap(getAllJsFiles).filter(f => !protectedFiles.has(path.normalize(f)));

let hasError = false;

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  let original = content;

  // Enforce LF newlines
  content = content.replace(/\r\n/g, '\n');

  // Ensure trailing newline
  if (!content.endsWith('\n')) {
    content += '\n';
  }

  if (content !== original) {
    if (isWrite) {
      fs.writeFileSync(f, content, 'utf8');
      console.log(`[FORMAT] Fixed: ${path.relative(rootDir, f)}`);
    } else if (isCheck) {
      console.error(`[FORMAT ERROR] Formatting deviation in: ${path.relative(rootDir, f)}`);
      hasError = true;
    }
  }
}

if (isCheck && hasError) {
  console.error('\nFormat check failed! Run "npm run format" to fix.');
  process.exit(1);
}

console.log(`[FORMAT] Checked ${files.length} JavaScript files. All clean.`);
process.exit(0);

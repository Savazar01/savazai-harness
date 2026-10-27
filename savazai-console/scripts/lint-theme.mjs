#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        results = results.concat(walk(fullPath));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walk(srcDir);
const prohibited = [
  { pattern: /\bbg-slate-9[05]0\b/, name: 'bg-slate-900/950 (use bg-card / bg-background / bg-muted)' },
  { pattern: /\bborder-slate-[789]00\b/, name: 'border-slate-700/800/900 (use border-border)' },
  { pattern: /\bbg-\[#[0-9a-fA-F]{3,8}\]/, name: 'hardcoded hex bg (use semantic token or var(--canvas-grid))' },
];

let errors = 0;

for (const file of files) {
  // Exclude email templates and palette definition
  const relPath = path.relative(srcDir, file).replace(/\\/g, '/');
  if (relPath.startsWith('lib/email/') || relPath === 'lib/theme/palette.ts') {
    continue;
  }

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const rule of prohibited) {
      if (rule.pattern.test(line)) {
        console.error(`❌ [Theme Lint] ${relPath}:${index + 1} - Prohibited pattern: ${rule.name}`);
        console.error(`   Line: ${line.trim().slice(0, 100)}`);
        errors++;
      }
    }
  });
}

if (errors > 0) {
  console.error(`\n🚨 Theme Lint Failed: ${errors} prohibited hardcoded styling pattern(s) found.`);
  process.exit(1);
} else {
  console.log('✅ Theme Lint Passed: Zero hardcoded dark/slate tokens found across UI components.');
  process.exit(0);
}

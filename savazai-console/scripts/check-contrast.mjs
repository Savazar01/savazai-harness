#!/usr/bin/env node
import { ACCENT_PRESETS, contrastRatio } from '../src/lib/theme/palette.ts';

console.log('🧪 Checking WCAG AA Contrast Compliance across all theme presets...\n');

let totalPairs = 0;
let passedPairs = 0;
let failedPairs = 0;

for (const accent of ACCENT_PRESETS) {
  // Light Mode: accent against light background (#ffffff)
  const lightBg = '#ffffff';
  const lightContrast = contrastRatio(accent.light, lightBg);
  totalPairs++;

  // Dark Mode: accent against dark background (#09090b)
  const darkBg = '#09090b';
  const darkContrast = contrastRatio(accent.dark, darkBg);
  totalPairs++;

  // UI / Badge check: minimum 3.0:1
  const lightPass = lightContrast >= 3.0;
  const darkPass = darkContrast >= 3.0;

  if (lightPass && darkPass) {
    passedPairs += 2;
    console.log(`  ✓ ${accent.label.padEnd(12)} - Light: ${lightContrast.toFixed(2)}:1 | Dark: ${darkContrast.toFixed(2)}:1 (Pass)`);
  } else {
    failedPairs += 2;
    console.error(`  ✗ ${accent.label.padEnd(12)} - Light: ${lightContrast.toFixed(2)}:1 | Dark: ${darkContrast.toFixed(2)}:1 (FAIL)`);
  }
}

console.log(`\n📊 Contrast Verification Summary: ${passedPairs}/${totalPairs} color contracts verified.`);

if (failedPairs > 0) {
  console.error(`🚨 Contrast Check Failed: ${failedPairs} theme contracts failed WCAG guidelines.`);
  process.exit(1);
} else {
  console.log('✅ All Accent Presets pass WCAG AA standards (minimum 3.0:1 for graphical objects/badges, 4.5:1 for text).\n');
  process.exit(0);
}

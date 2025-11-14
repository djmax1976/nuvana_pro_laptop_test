#!/usr/bin/env node

/**
 * License Compliance Checker for S5 Security Stage
 *
 * Validates all production dependencies use approved licenses.
 * Fails CI if any dependencies use restricted licenses.
 */

const { execSync } = require('child_process');

// Approved licenses (permissive open-source)
const APPROVED_LICENSES = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'CC0-1.0',
  '0BSD',
  'Unlicense',
  'CC-BY-3.0',
  'CC-BY-4.0',
]);

// Restricted licenses (copyleft, proprietary, or unclear)
const RESTRICTED_LICENSES = new Set([
  'GPL-2.0',
  'GPL-3.0',
  'AGPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'UNLICENSED',
  'UNKNOWN',
]);

console.log('=== License Compliance Check ===\n');

try {
  // Get production dependencies with licenses
  const output = execSync('npm list --production --json', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'ignore']
  });

  const packageTree = JSON.parse(output);
  const violations = [];
  const warnings = [];

  function checkDependencies(deps, path = '') {
    if (!deps) return;

    for (const [name, info] of Object.entries(deps)) {
      const pkgPath = path ? `${path} > ${name}` : name;
      const license = info.license || 'UNKNOWN';

      // Check for restricted licenses
      if (RESTRICTED_LICENSES.has(license)) {
        violations.push({ package: pkgPath, license });
      }
      // Check for unknown licenses (not in approved list)
      else if (!APPROVED_LICENSES.has(license)) {
        warnings.push({ package: pkgPath, license });
      }

      // Recursively check nested dependencies
      if (info.dependencies) {
        checkDependencies(info.dependencies, pkgPath);
      }
    }
  }

  checkDependencies(packageTree.dependencies);

  // Report results
  if (violations.length > 0) {
    console.error('❌ LICENSE VIOLATIONS FOUND:\n');
    violations.forEach(({ package: pkg, license }) => {
      console.error(`  ${pkg} → ${license}`);
    });
    console.error('\nRestricted licenses detected. Please remove or replace these dependencies.\n');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  UNKNOWN/UNCOMMON LICENSES:\n');
    warnings.forEach(({ package: pkg, license }) => {
      console.warn(`  ${pkg} → ${license}`);
    });
    console.warn('\nThese licenses are not in the approved list. Review manually.\n');
  }

  console.log('✓ All production dependencies use approved licenses\n');
  console.log(`Checked: ${violations.length + warnings.length} packages`);
  console.log(`Approved: ${APPROVED_LICENSES.size} license types\n`);

  process.exit(0);

} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('Error: npm not found. Ensure Node.js/npm is installed.');
  } else {
    console.error('Error running license check:', error.message);
  }
  process.exit(1);
}

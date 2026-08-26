import { readFile } from 'node:fs/promises';

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error('Usage: node scripts/check-pgtap-plan.mjs <test.sql> [...]');
  process.exit(2);
}

let failed = false;

for (const file of files) {
  const sql = await readFile(file, 'utf8');
  const plan = sql.match(/extensions\.plan\(\s*(\d+)\s*\)/i);
  const assertions = sql.match(
    /select\s+extensions\.(?:ok|is|isnt|results_eq|results_ne|throws_ok|lives_ok|has_[a-z_]*)\s*\(/gi,
  ) ?? [];

  if (!plan) {
    console.error(`${file}: missing extensions.plan(...)`);
    failed = true;
    continue;
  }

  const expected = Number(plan[1]);
  if (expected !== assertions.length) {
    console.error(`${file}: plan ${expected}, found ${assertions.length} assertions`);
    failed = true;
  } else {
    console.log(`${file}: plan ${expected} matches ${assertions.length} assertions`);
  }
}

if (failed) process.exit(1);

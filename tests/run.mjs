#!/usr/bin/env node
// Runs the parser over every fixture PDF and diffs the result against the expected
// output recorded beside it.
//
//   node tests/run.mjs                 compare every fixture
//   node tests/run.mjs --only maybank  compare fixtures whose name contains "maybank"
//   node tests/run.mjs --update        record the current output as expected
//
// Exit code is 1 if anything differs, so this can gate a commit.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, sep } from "node:path";
import { loadCore } from "./lib/core.mjs";
import { openPdf, ScannedPdfError } from "./lib/doc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "fixtures");
const EXPECTED = join(here, "expected");

const args = process.argv.slice(2);
const update = args.includes("--update");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex === -1 ? null : args[onlyIndex + 1];

// ---------------------------------------------------------------- snapshot

// What gets compared. Deliberately includes the derived totals: a wrong amount changes
// them even when the row count is unchanged, which is the failure that matters most.
function snapshot(core, outcome) {
  const totals = core.statementTotals(outcome);
  const check = core.statementCheck(outcome);

  return {
    bank: outcome.bank,
    method: outcome.method,
    opening: outcome.opening ?? null,
    closing: outcome.closing ?? null,
    transactionCount: outcome.transactions.length,
    totals: {
      credit: totals.credit ?? null,
      debit: totals.debit ?? null,
      net: totals.net ?? null,
      opening: totals.opening ?? null,
      closing: totals.closing ?? null,
    },
    // "verified" means the rows reconcile against the statement's own totals.
    reconciliation: check?.verdict ?? null,
    flaggedCount: outcome.transactions.filter(
      (t) => (t._low_confidence_fields || []).length,
    ).length,
    transactions: outcome.transactions.map((t) => ({
      date: t.Date ?? null,
      description: Array.isArray(t.Description) ? t.Description.join(" ") : (t.Description ?? null),
      type: t.Type ?? null,
      amount: t.Amount ?? null,
      balance: t.Balance ?? null,
      flagged: (t._low_confidence_fields || []).slice().sort(),
    })),
  };
}

// ---------------------------------------------------------------- diffing

function describeDifference(expected, actual) {
  const notes = [];

  for (const key of ["bank", "method", "transactionCount", "reconciliation", "flaggedCount"]) {
    if (expected[key] !== actual[key]) {
      notes.push(`${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual[key])}`);
    }
  }

  for (const key of Object.keys(expected.totals || {})) {
    if (expected.totals[key] !== actual.totals[key]) {
      notes.push(`totals.${key}: expected ${expected.totals[key]}, got ${actual.totals[key]}`);
    }
  }

  const rows = Math.max(expected.transactions.length, actual.transactions.length);
  let shown = 0;
  for (let i = 0; i < rows && shown < 5; i += 1) {
    const a = expected.transactions[i];
    const b = actual.transactions[i];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      notes.push(`row ${i + 1}:\n      expected ${JSON.stringify(a)}\n      got      ${JSON.stringify(b)}`);
      shown += 1;
    }
  }
  if (shown === 5) notes.push("…further row differences not shown");

  return notes;
}

// ---------------------------------------------------------------- run

async function main() {
  if (!existsSync(FIXTURES)) await mkdir(FIXTURES, { recursive: true });
  if (!existsSync(EXPECTED)) await mkdir(EXPECTED, { recursive: true });

  const core = loadCore();

  // Fixtures may sit in subfolders (one per bank, say); expected output mirrors the layout.
  const files = (await readdir(FIXTURES, { recursive: true }))
    .map((name) => name.split(sep).join("/"))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .filter((name) => !only || name.toLowerCase().includes(only.toLowerCase()))
    .sort();

  if (!files.length) {
    console.log(
      only
        ? `No fixture matches "${only}".`
        : "No fixtures yet. Put statement PDFs in tests/fixtures/ and run with --update.\n" +
          "See tests/README.md — these files stay out of git.",
    );
    return 0;
  }

  let passed = 0, failed = 0, skipped = 0, recorded = 0;

  for (const file of files) {
    const name = file.slice(0, -".pdf".length);
    const expectedPath = join(EXPECTED, `${name}.json`);
    let doc = null;

    try {
      doc = await openPdf(join(FIXTURES, file), core);
      const outcome = await core.parseStatement(doc, () => {});
      const actual = snapshot(core, outcome);

      if (update || !existsSync(expectedPath)) {
        await mkdir(dirname(expectedPath), { recursive: true });
        await writeFile(expectedPath, JSON.stringify(actual, null, 2) + "\n");
        console.log(`RECORDED  ${name}  (${actual.transactionCount} rows, ${actual.bank})`);
        recorded += 1;
        continue;
      }

      const expected = JSON.parse(await readFile(expectedPath, "utf8"));
      const notes = describeDifference(expected, actual);

      if (!notes.length) {
        console.log(`PASS      ${name}  (${actual.transactionCount} rows)`);
        passed += 1;
      } else {
        console.log(`FAIL      ${name}`);
        for (const note of notes) console.log(`    ${note}`);
        failed += 1;
      }
    } catch (error) {
      if (error instanceof ScannedPdfError) {
        console.log(`SKIP      ${name}  (needs OCR)`);
        skipped += 1;
      } else {
        console.log(`ERROR     ${name}: ${error.message}`);
        failed += 1;
      }
    } finally {
      if (doc) await doc.destroy().catch(() => {});
    }
  }

  const parts = [];
  if (passed) parts.push(`${passed} passed`);
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (recorded) parts.push(`${recorded} recorded`);
  console.log(`\n${parts.join(", ") || "nothing to do"}`);

  return failed ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(error);
  process.exit(1);
});

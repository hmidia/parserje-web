# Parser regression suite

Runs the real parser over real statements and tells you if the numbers changed.

The thing most likely to hurt someone using Parserje is a **silent misread** — a workbook
that looks clean but has a wrong amount or a missing transaction. Nothing errors, every
button works, and the mistake travels into someone's accounts. This suite is what catches
that, and it is the reason to run it before every change to parsing.

## Setup

```bash
cd tests
npm install
```

One dependency: pdf.js, pinned to 3.11.174 — the same version `index.html` loads, so the
tests read PDFs exactly the way the site does.

## Use

```bash
npm test                      # compare every fixture against its expected output
node run.mjs --only maybank   # just the fixtures whose name contains "maybank"
npm run record                # record current output as expected (see below)
```

Exit code is 1 when anything differs, so it can gate a commit or a CI step.

## Adding a statement

1. Drop the PDF in `tests/fixtures/`. Name it for what it is: `maybank-current-2026-03.pdf`.
   Subfolders are fine (one per bank, say); the expected output mirrors the layout.
2. Run `npm test`. With no expected file yet, the output is recorded and the run reports
   `RECORDED`.
3. **Open the recorded JSON and check it against the actual statement.** This is the step
   that matters. The recorded output is whatever the parser currently produces — right or
   wrong. If you record a wrong result, you have frozen the bug as correct and the suite
   will defend it forever.
4. Once verified, commit the expected file (see the privacy note below first).

When a change is a genuine improvement, `npm run record` refreshes everything. Read the diff
before you do — that command is how a regression gets blessed by accident.

## Privacy: fixtures stay out of git

`tests/fixtures/` and `tests/expected/` are gitignored, and should stay that way.

The repo is public. Fixtures are real bank statements, and the expected files contain every
transaction — dates, descriptions, amounts, balances. Committing either would publish
someone's account activity. The person who sent you a statement to help you fix a parser
did not agree to that.

Keep them locally, or in a private repo alongside this one. If you ever want a fixture that
can be public, build a synthetic PDF with invented transactions rather than redacting a real
one — redaction misses things.

## What gets compared

Per fixture: the detected bank, the extraction method, the transaction count, opening and
closing balances, total credit, debit and net, the reconciliation verdict, how many rows are
flagged for checking, and every row's date, description, type, amount, balance and flags.

The totals are in there on purpose. A single misread digit changes a total even when the row
count looks right, which is exactly the failure a row count alone would miss.

## Scanned statements

The suite doesn't run OCR. Running tesseract would need a canvas and about fifteen seconds a
page, and the point of this suite is a fast answer about parsing logic.

Instead it replays OCR recorded in the browser. Save `{ "pages": [...] }` — each page exactly
as the site's `ocrPage(i)` returns it — beside the PDF as `<name>.ocr.json`, and the scan is
parsed from that like any other fixture. It's as private as the PDF and gitignored with it.
A scanned fixture without one reports `SKIP`.

Replaying tests the parsing of a scan, not the OCR itself. That still needs testing by hand,
in the browser, per CUJ-02 in `.ux/cujs.md`.

## How it finds the parser

`lib/core.mjs` reads the `<script id="parserje-core">` block out of `index.html` and
evaluates it. There's no copy of the parser here, so the suite can't drift from what the
site ships. If that script is ever renamed or moved into its own file, that loader is the
one place to update.

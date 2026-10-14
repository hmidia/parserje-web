// Loads ParserjeCore out of index.html.
//
// The parser lives in an inline <script id="parserje-core"> in index.html and is the
// only copy. Tests read it from there at run time rather than duplicating it, so the
// suite can never drift from what the site actually ships.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));

// Where index.html might be, relative to tests/lib/. Covers the tidy layout (repo root
// one level above tests/) and the common case where the repo sits in a subfolder of
// wherever the zip was extracted. PARSERJE_INDEX overrides all of it.
function candidates() {
  const found = [];
  if (process.env.PARSERJE_INDEX) found.push(resolve(process.env.PARSERJE_INDEX));

  let dir = join(here, "..");            // tests/
  for (let up = 0; up < 4; up += 1) {
    found.push(join(dir, "index.html"));
    found.push(join(dir, "parserje", "index.html"));
    found.push(join(dir, "parserje-web", "index.html"));
    dir = join(dir, "..");
  }
  return found;
}

export function findIndex() {
  for (const path of candidates()) {
    if (existsSync(path)) return path;
  }
  throw new Error(
    "Couldn't find index.html. Looked in:\n  " +
    candidates().join("\n  ") +
    "\n\nEither move index.html so it sits beside the tests folder, or point at it:\n" +
    "  PARSERJE_INDEX=../parserje/index.html npm test        (bash)\n" +
    "  $env:PARSERJE_INDEX='..\\parserje\\index.html'; npm test   (PowerShell)",
  );
}

export const INDEX = (() => {
  try { return findIndex(); } catch { return null; }
})();

export function loadCore(indexPath) {
  const path = indexPath || findIndex();
  const html = readFileSync(path, "utf8");
  const match = html.match(/<script id="parserje-core">([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error(
      `No <script id="parserje-core"> found in ${path}. ` +
      "If the script was renamed or moved to its own file, update tests/lib/core.mjs.",
    );
  }

  // The module is UMD-shaped: it attaches to the global it is handed.
  const sandbox = { module: { exports: {} }, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(match[1], { filename: "parserje-core.js" }).runInContext(sandbox);

  const core = sandbox.ParserjeCore || sandbox.module.exports;
  if (!core || typeof core.parseStatement !== "function") {
    throw new Error("Loaded parserje-core but it did not export parseStatement.");
  }
  return core;
}

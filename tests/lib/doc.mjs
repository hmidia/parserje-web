// Builds the "document" object parseStatement expects, backed by pdf.js in Node.
//
// index.html builds the same shape from pdf.js in the browser (see openPdf). The
// contract is documented at the top of the parserje-core script:
//
//   pageCount
//   selectableLines()  -> Promise<string[]>
//   pageTextLines(i)   -> Promise<string[]>
//   pageWords(i)       -> Promise<[x0, y0, x1, y1, text][]>
//   ocrPage(i)         -> Promise<{text, lines}>
//
// ocrPage doesn't run OCR: that needs a canvas and tesseract, and the point of this
// suite is to catch parser regressions fast. Instead it replays OCR recorded in the
// browser, saved beside the PDF as <name>.ocr.json ({ pages: [ocrPage(0), ...] }).
// Scanned fixtures without one are reported as skipped rather than silently passing.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let pdfjs = null;
async function getPdfjs() {
  if (!pdfjs) {
    // The legacy build is the one that runs outside a browser.
    pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    pdfjs.GlobalWorkerOptions.workerSrc = require.resolve(
      "pdfjs-dist/legacy/build/pdf.worker.js",
    );
  }
  return pdfjs;
}

export class ScannedPdfError extends Error {}

export async function openPdf(path, core) {
  const lib = await getPdfjs();
  const data = new Uint8Array(await readFile(path));
  const pdf = await lib.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;

  const textCache = new Map();
  const wordCache = new Map();
  const ocrPath = path.replace(/\.pdf$/i, ".ocr.json");
  const recordedOcr = existsSync(ocrPath) ? JSON.parse(await readFile(ocrPath, "utf8")).pages : null;

  const pageTextLines = (index) => {
    if (!textCache.has(index)) {
      textCache.set(index, pdf.getPage(index + 1)
        .then((page) => page.getTextContent())
        .then((content) => core.textLinesFromItems(content.items)));
    }
    return textCache.get(index);
  };

  return {
    pageCount: pdf.numPages,

    async selectableLines() {
      const lines = [];
      for (let index = 0; index < pdf.numPages; index += 1) {
        lines.push(...(await pageTextLines(index)));
      }
      return lines;
    },

    pageTextLines,

    pageWords(index) {
      if (!wordCache.has(index)) {
        wordCache.set(index, pdf.getPage(index + 1).then(async (page) => {
          const content = await page.getTextContent({ disableCombineTextItems: true });
          return core.wordsFromItems(content.items, page.view, content.styles);
        }));
      }
      return wordCache.get(index);
    },

    async ocrPage(index) {
      if (recordedOcr && recordedOcr[index]) return recordedOcr[index];
      throw new ScannedPdfError(
        "This statement needs OCR, which the test harness does not run. Record it in the browser first.",
      );
    },

    destroy() { return pdf.destroy(); },
  };
}

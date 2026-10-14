# Parserje

Converts bank statement PDFs into a clean Excel workbook — entirely in your browser.

Your statements are never uploaded. There is no server, no account, and no storage. The PDF
is read in the browser tab, parsed in memory, and the resulting `.xlsx` is written to a blob
the browser hands straight to your downloads folder. Closing the tab destroys everything.

**Live:** https://USERNAME.github.io/parserje/

## Why it works this way

Bank statements are about as sensitive as a document gets. Most online converters ask you to
upload one to a server you know nothing about. Parserje doesn't ask, because it can't use it —
there's nowhere for a file to go.

This repo being public is part of that claim. You can read every line that touches your PDF.

## How to run it locally

It's a single static page with no build step:

```bash
git clone https://github.com/USERNAME/parserje.git
cd parserje
python3 -m http.server 8000
```

Then open http://localhost:8000.

Opening `index.html` directly from the filesystem mostly works, but some browsers restrict
web workers over `file://`, which the PDF reader needs. The local server avoids that.

## Setup: feedback form

The feedback form posts to [Web3Forms](https://web3forms.com). Before it works, get an access
key (they email you one) and replace the placeholder in `index.html`:

```js
var ACCESS_KEY = "PASTE_YOUR_WEB3FORMS_ACCESS_KEY_HERE";
```

The key is public by design — it only permits posting to the form. Only the message and an
optional reply address are ever sent. No statement data passes through it.

## Built with

| Library | Used for |
| --- | --- |
| [pdf.js](https://mozilla.github.io/pdf.js/) 3.11 | Reading text and layout out of the PDF |
| [ExcelJS](https://github.com/exceljs/exceljs) 4.4 | Writing the `.xlsx` workbook |
| [tesseract.js](https://tesseract.projectnaptha.com/) 5.1 | OCR fallback for scanned statements |

All three load from a CDN at runtime. ExcelJS and tesseract.js are fetched lazily — only when
you export, or when a statement turns out to need OCR.

## Status

v0.9.0 beta. Parsing accuracy varies by bank and statement layout. Always check the preview
against your statement before relying on the output — and if something comes out wrong, the
feedback form on the site is the fastest way to tell me.

## Credits

Designed and built by Midi.

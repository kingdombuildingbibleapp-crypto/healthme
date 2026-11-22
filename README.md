# HealthyScan

Pick any health condition, scan the barcode on any product, and see how good or bad it is for you: a green check, a yellow line or a red X, with a percentage and the reasons why.

**Live app:** https://healthyscan.net

It works on food and drinks, skincare and cosmetics, cleaning products, pet food, and general products.

## Features

- **318 conditions** in a searchable list: illnesses, disorders, diseases, food allergies, skin conditions, mental health, pregnancy, diet goals, and 23 medication groups. Anything not listed can be typed in and is rated from keywords in its name.
- **Barcode scanning** with the phone camera, a photo, or by typing the number.
- **Product lookup** across Open Food Facts, Open Beauty Facts, Open Pet Food Facts and Open Products Facts, with UPCitemdb as a fallback for general products. Unknown products can be rated by typing the ingredients.
- **Medical record import** (optional). Reads PDFs (including scans), photos, CCD/XML, FHIR JSON or pasted text, and finds diagnoses, ICD-10 codes, allergies, medications and out-of-range lab values. The user reviews every finding before it's added.
- Installable as a home-screen app (PWA) and works offline apart from lookups.

## Privacy

Medical records are processed entirely in the browser and are never uploaded. Text recognition (Tesseract) and PDF reading (pdf.js) are hosted with the app. After analysis the record text is discarded; only the conditions the user approves are saved, in the browser's local storage.

## How ratings work

Each condition maps to weighted factors: nutrients (sugar, salt, saturated fat…), allergens, specific compounds (caffeine, tyramine, purines, grapefruit…) and topical ingredients (fragrance, sulfates, formaldehyde releasers…). A product starts from a base score and each factor found subtracts or adds points. Allergens and dangerous drug interactions cap the score in the red. 70%+ is green, 40–69% yellow, below 40% red.

- `site/js/conditions.js` is the condition library
- `site/js/engine.js` holds the factor definitions and scoring
- `site/js/records.js` is the medical record reader

## Run locally

Any static server works, for example:

```bash
npx serve site
```

The camera needs HTTPS or `localhost`. The `/api/upc` fallback lookup runs as a Netlify Function (`netlify/functions/upc.js`).

## Deploy

Connect this repository to Netlify. `netlify.toml` sets the publish folder and functions; no build step is needed.

## Credits and licenses

- Product data © Open Food Facts contributors, under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/)
- [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT), the ZXing C++ barcode reader compiled to WebAssembly
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0)
- [Tesseract.js](https://github.com/naptha/tesseract.js) and Tesseract trained data (Apache-2.0)

## Disclaimer

HealthyScan gives general guidance from ingredient and nutrition data. It is not medical advice and can miss things. Always read the label and follow your doctor's advice, especially for allergies.

## Background photos

Homepage background photos are from Unsplash under the [Unsplash License](https://unsplash.com/license) (free for commercial use, no attribution required). They're credited here as a courtesy:
- Fresh produce flat lay: `photo-1610348725531-843dff563e2c`
- Unbranded personal-care bottles: `photo-1631390179406-0bfe17e9f89d`

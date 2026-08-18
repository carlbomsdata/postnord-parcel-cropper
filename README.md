# postnord-parcel-cropper

**Parcel Cropper** – a minimalist, static web app that crops Tradera's A4 PostNord shipping label down to a clean **104.4 × 187.8 mm** label, ready for a Zebra or any other label printer.

**Live:** https://carlboms-data-ab.github.io/postnord-parcel-cropper/

## Features

- All processing happens locally in your browser – the PDF is never uploaded to any server.
- Text and barcodes are kept as vector PDF via `pdf-lib` (not rasterized to a screenshot).
- Simple step-by-step guide. What you see in the preview is what gets exported.
- The selection starts on the crop area for the current Tradera/PostNord template.

## Usage

The app guides you through three steps:

1. **Upload** – choose or drop the PDF file from Tradera (only the first page is processed).
2. **Crop** – rotate the label with **⟲ / ⟳**, zoom with **− / +**, and drag the blue box (or the handles / arrow keys) inside the dashed crop marks. The selection size is shown in the toolbar.
3. **Result** – review the finished label and click **Download**. Print at actual size (100 % scale) on **104.4 × 187.8 mm**.

## Run locally

Serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

## Publish with GitHub Pages

Enabled via **Settings → Pages → Deploy from a branch** (`main` / `/root`).

## External libraries

Loaded from CDN and run in the browser – the PDF is never sent to these services:

- PDF.js 3.11.174
- pdf-lib 1.17.1

## License

GPL-3.0 – see [LICENSE](LICENSE).

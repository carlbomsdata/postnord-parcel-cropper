# postnord-parcel-cropper

Crops Tradera/PostNord PDF shipping labels and prepares JPG/PNG photos at an
exact print size. Everything runs locally in the browser; files are never uploaded.

**Live:** <https://carlbomsdata.github.io/postnord-parcel-cropper/>

PDF labels stay vector, so text and barcodes stay sharp. The initial label
selection is 103.8 × 188.1 mm; PDF crops preserve their original physical scale.

## Use

1. Choose or drop a PDF, JPG or PNG.
2. Position the crop, rotate or zoom as needed.
3. Choose the export paper and download the PDF.

For photos, the width and height fields set the final printed size independently
of the crop. The default is **63 × 88 mm**, with a Pokémon card preset to restore
that size. **Crop to fill** locks the selection to the print aspect ratio;
**Fit whole photo** keeps the full image with white borders where needed.
JPEG orientation is applied before editing and export.
Rotating swaps the output width and height to preserve the selected crop.

**Sized PDF** exports a page exactly the size of the crop or photo.
**A4** centres it at the same physical size, choosing landscape when needed.
**Crop marks** are an optional checkbox for A4 and are off by default.
The result preview shows the actual exported PDF, including the selected marks.

Print at **100% / Actual size**, with **Fit to page turned off**.

## Run

Static files, no build: `python3 -m http.server 8000`. Pushing to `main`
publishes through GitHub Pages.

## Check

No build or package installation is required:

```sh
node --check app.js
node --check print-helpers.js
node --test tests/*.test.js
```

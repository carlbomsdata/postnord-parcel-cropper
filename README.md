# postnord-parcel-cropper

Cuts the shipping label out of a Tradera/PostNord A4 PDF and saves it at
104.4 × 187.8 mm, real size, for a label printer. Runs in the browser; the PDF
is never uploaded.

**Live:** <https://carlboms-data-ab.github.io/postnord-parcel-cropper/>

The label stays vector — cropped with pdf-lib, not screenshotted — so the text
and barcode stay sharp.

## Use

Upload the PDF, drag the box over the label (rotate or zoom if needed), download.
Print at 100 %, no fit-to-page.

## Run

Static files, no build: `python3 -m http.server 8000`. Pushing to `main`
publishes through GitHub Pages.

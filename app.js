/* global pdfjsLib, PDFLib, PrintHelpers */
(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  function setStatus(message, type = "") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`.trim();
  }

  if (typeof pdfjsLib === "undefined" || typeof PDFLib === "undefined" || typeof PrintHelpers === "undefined") {
    setStatus("Could not load required libraries. Check your connection and reload the page.", "error");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const MIN_SELECTION_PX = 30;
  const STEPS = 3;

  // Default label for the current Tradera/PostNord template: size in mm and
  // center point (fraction of the page). The selection is computed from the actual page size.
  const DEFAULT_W_MM = 103.8;
  const DEFAULT_H_MM = 188.1;
  const LABEL_CENTER = Object.freeze({ x: 0.254834, y: 0.453147 });

  function defaultSelectionForPage(pageWidthPt, pageHeightPt) {
    const width = clamp(mmToPoints(DEFAULT_W_MM) / pageWidthPt, 0.02, 1);
    const height = clamp(mmToPoints(DEFAULT_H_MM) / pageHeightPt, 0.02, 1);
    const x = clamp(LABEL_CENTER.x - width / 2, 0, 1 - width);
    const y = clamp(LABEL_CENTER.y - height / 2, 0, 1 - height);
    return { x, y, width, height };
  }

  const el = {
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    stepEls: Array.from(document.querySelectorAll(".steps li")),
    panelUpload: document.getElementById("panelUpload"),
    panelEdit: document.getElementById("panelEdit"),
    preview: document.getElementById("preview"),
    pageStage: document.getElementById("pageStage"),
    canvas: document.getElementById("pdfCanvas"),
    selection: document.getElementById("selection"),
    shadeTop: document.getElementById("shadeTop"),
    shadeRight: document.getElementById("shadeRight"),
    shadeBottom: document.getElementById("shadeBottom"),
    shadeLeft: document.getElementById("shadeLeft"),
    panelDownload: document.getElementById("panelDownload"),
    resultPreview: document.getElementById("resultPreview"),
    resultCanvas: document.getElementById("resultCanvas"),
    rotateLeftButton: document.getElementById("rotateLeftButton"),
    rotateRightButton: document.getElementById("rotateRightButton"),
    resetButton: document.getElementById("resetButton"),
    zoomInButton: document.getElementById("zoomInButton"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    backButton: document.getElementById("backButton"),
    nextButton: document.getElementById("nextButton"),
    ow2: document.getElementById("ow2"),
    oh2: document.getElementById("oh2"),
    ow3: document.getElementById("ow3"),
    oh3: document.getElementById("oh3"),
    photoTools: document.getElementById("photoTools"),
    photoFit: document.getElementById("photoFit"),
    cardPreset: document.getElementById("cardPreset"),
    paperSize: document.getElementById("paperSize"),
    cropMarks: document.getElementById("cropMarks"),
    nav: document.querySelector(".nav")
  };

  const state = {
    step: 1,
    sourceBytes: null,
    sourceName: "",
    sourceKind: "pdf",
    photoWidthMm: 63,
    photoHeightMm: 88,
    loadId: 0,
    pdfDocument: null,
    pdfPage: null,
    stageWidth: 0,
    stageHeight: 0,
    baseRotation: 0,
    userRotation: 0,
    zoom: 1,
    pageW: 0,
    pageH: 0,
    selection: { x: 0.1, y: 0.1, width: 0.5, height: 0.6 },
    generatedUrl: null,
    resultDoc: null,
    pointerSession: null,
    resizeTimer: null,
    isRendering: false,
    renderQueued: false,
    resultBusy: false,
    resultQueued: false
  };

  function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }

  function totalRotation() {
    return normalizeAngle(state.baseRotation + state.userRotation);
  }

  // Rotate a normalized selection (y down) together with the content.
  function rotateSelectionCW(s) {
    return { x: 1 - s.y - s.height, y: s.x, width: s.height, height: s.width };
  }

  function rotateSelectionCCW(s) {
    return { x: s.y, y: 1 - s.x - s.width, width: s.height, height: s.width };
  }

  // Presetrutan uttryckt i den aktuella rotationens visningsram.
  function presetForCurrentRotation() {
    if (state.sourceKind === "image") {
      return photoSelection({ x: 0, y: 0, width: 1, height: 1 });
    }
    const vp = state.pdfPage.getViewport({ scale: 1, rotation: state.baseRotation });
    let s = defaultSelectionForPage(vp.width, vp.height);
    const turns = normalizeAngle(state.userRotation) / 90;
    for (let i = 0; i < turns; i++) s = rotateSelectionCW(s);
    return s;
  }

  // Map a point in the displayed (rotated) image to the source page's normalized
  // coordinates (u = left→right, v = top→bottom).
  function mapDisplayToSource(nx, ny, angle) {
    switch (angle) {
      case 90: return { u: ny, v: 1 - nx };
      case 180: return { u: 1 - nx, v: 1 - ny };
      case 270: return { u: 1 - ny, v: nx };
      default: return { u: nx, v: ny };
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mmToPoints(mm) {
    return mm * 72 / 25.4;
  }

  function outputFilename() {
    const base = (state.sourceName || "print").replace(/\.(pdf|jpe?g|png)$/i, "").replace(/[\\/:*?"<>|]+/g, "-");
    return `${base}-${state.sourceKind === "image" ? "photo" : "etikett"}.pdf`;
  }

  function photoAspectLocked() {
    return state.sourceKind === "image" && el.photoFit.value === "cover";
  }

  function photoSelection(selection) {
    if (!photoAspectLocked()) return selection;
    const vp = state.pdfPage.getViewport({ scale: 1, rotation: totalRotation() });
    const rect = PrintHelpers.fitAspectRect({
      x: selection.x * vp.width,
      y: selection.y * vp.height,
      width: selection.width * vp.width,
      height: selection.height * vp.height
    }, { width: vp.width, height: vp.height }, state.photoWidthMm / state.photoHeightMm);
    return { x: rect.x / vp.width, y: rect.y / vp.height,
      width: rect.width / vp.width, height: rect.height / vp.height };
  }

  function updateExportOptions() {
    el.cropMarks.disabled = el.paperSize.value !== "a4";
    if (el.cropMarks.disabled) el.cropMarks.checked = false;
    el.cropMarks.title = el.cropMarks.disabled ? "Choose A4 to add crop marks." : "";
  }

  function revokeGeneratedUrl() {
    if (state.generatedUrl) {
      URL.revokeObjectURL(state.generatedUrl);
      state.generatedUrl = null;
    }
  }

  // --- Guide-navigering ------------------------------------------------------

  function goToStep(step) {
    state.step = clamp(step, 1, STEPS);
    renderStep();
  }

  function renderStep() {
    const s = state.step;

    el.stepEls.forEach((li, index) => {
      const stepNumber = index + 1;
      const reachable = stepNumber === 1 || !!state.pdfPage;
      li.classList.toggle("active", stepNumber === s);
      li.classList.toggle("done", stepNumber < s);
      li.classList.toggle("clickable", reachable);
      if (reachable) {
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
      } else {
        li.removeAttribute("role");
        li.removeAttribute("tabindex");
      }
    });

    el.panelUpload.hidden = s !== 1;
    el.panelEdit.hidden = s !== 2;
    el.panelDownload.hidden = s !== 3;

    el.backButton.hidden = s === 1;
    el.backButton.textContent = "Tillbaka";
    el.nextButton.hidden = !((s === 1 && state.pdfPage) || s === 2 || s === 3);
    el.nextButton.textContent = s === 1 ? "Continue" : s === 3 ? "Download" : "Next";
    el.nav.hidden = el.backButton.hidden && el.nextButton.hidden;
    el.nextButton.disabled = s === 3 && state.resultBusy;
    el.photoTools.hidden = state.sourceKind !== "image";

    setStatus("");
    if (s === 2) renderPage();
    else if (s === 3) showResult();
  }

  function goNext() {
    goToStep(state.step + 1);
  }

  function goBack() {
    goToStep(state.step - 1);
  }

  function primaryAction() {
    if (state.step === 3) downloadResult();
    else goNext();
  }

  // --- Loading & rendering ---------------------------------------------------

  async function imageToPdf(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The image could not be decoded.");
      const pdf = await PDFLib.PDFDocument.create();
      const embedded = await pdf.embedPng(await blob.arrayBuffer());
      const page = pdf.addPage([canvas.width, canvas.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      return pdf.save();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function loadFile(file) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isImage = ["image/jpeg", "image/png"].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!isPdf && !isImage) {
      setStatus("Choose a PDF, JPG or PNG file.", "error");
      return;
    }

    const loadId = ++state.loadId;
    setStatus(isPdf ? "Reading PDF…" : "Reading photo…");

    try {
      const bytes = isPdf ? new Uint8Array(await file.arrayBuffer()) : await imageToPdf(file);
      const pdfDocument = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pdfPage = await pdfDocument.getPage(1);
      if (loadId !== state.loadId) {
        pdfDocument.destroy();
        return;
      }

      if (state.pdfDocument) {
        try { state.pdfDocument.destroy(); } catch (_) { /* no-op */ }
      }

      state.sourceBytes = bytes;
      state.sourceName = file.name;
      state.sourceKind = isPdf ? "pdf" : "image";
      state.photoWidthMm = 63;
      state.photoHeightMm = 88;
      state.pdfDocument = pdfDocument;
      state.pdfPage = pdfPage;
      state.baseRotation = normalizeAngle(pdfPage.rotate || 0);
      state.userRotation = 0;
      state.zoom = 1;
      const vp = pdfPage.getViewport({ scale: 1, rotation: state.baseRotation });
      el.photoFit.value = "cover";
      el.paperSize.value = isPdf ? "crop" : "a4";
      el.cropMarks.checked = false;
      updateExportOptions();
      state.selection = isPdf ? defaultSelectionForPage(vp.width, vp.height) : presetForCurrentRotation();
      revokeGeneratedUrl();

      goToStep(2);
    } catch (error) {
      if (loadId !== state.loadId) return;
      console.error(error);
      setStatus(isPdf ? "The PDF could not be read. Make sure it is not password-protected."
        : "The photo could not be read. Choose a valid JPG or PNG file.", "error");
    }
  }

  async function renderPage() {
    if (!state.pdfPage) return;
    if (state.isRendering) {
      state.renderQueued = true;
      return;
    }
    state.isRendering = true;

    try {
      const rotation = totalRotation();
      const scaleViewport = state.pdfPage.getViewport({ scale: 1, rotation });
      state.pageW = scaleViewport.width;
      state.pageH = scaleViewport.height;

      // Fit into the available area (width + height) and multiply by zoom.
      const availableWidth = Math.max(1, el.preview.clientWidth - 28);
      const availableHeight = Math.max(1, el.preview.clientHeight - 28);
      const fitScale = Math.min(availableWidth / scaleViewport.width, availableHeight / scaleViewport.height);
      const cssScale = fitScale * state.zoom;
      el.preview.classList.toggle("zoomed", state.zoom > 1.001);
      const cssViewport = state.pdfPage.getViewport({ scale: cssScale, rotation });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = state.pdfPage.getViewport({ scale: cssScale * pixelRatio, rotation });

      state.stageWidth = cssViewport.width;
      state.stageHeight = cssViewport.height;

      el.pageStage.style.width = `${state.stageWidth}px`;
      el.pageStage.style.height = `${state.stageHeight}px`;
      el.canvas.style.width = `${state.stageWidth}px`;
      el.canvas.style.height = `${state.stageHeight}px`;
      el.canvas.width = Math.ceil(renderViewport.width);
      el.canvas.height = Math.ceil(renderViewport.height);

      const context = el.canvas.getContext("2d", { alpha: false });
      await state.pdfPage.render({ canvasContext: context, viewport: renderViewport }).promise;
      updateSelectionUi();
    } finally {
      state.isRendering = false;
      if (state.renderQueued) {
        state.renderQueued = false;
        renderPage();
      }
    }
  }

  // --- Markering -------------------------------------------------------------

  function getSelectionPixels() {
    return {
      x: state.selection.x * state.stageWidth,
      y: state.selection.y * state.stageHeight,
      width: state.selection.width * state.stageWidth,
      height: state.selection.height * state.stageHeight
    };
  }

  function setSelectionFromPixels(rect) {
    const minWidth = Math.min(MIN_SELECTION_PX, state.stageWidth);
    const minHeight = Math.min(MIN_SELECTION_PX, state.stageHeight);

    if (photoAspectLocked()) {
      rect = PrintHelpers.fitAspectRect(rect,
        { width: state.stageWidth, height: state.stageHeight }, state.photoWidthMm / state.photoHeightMm);
    } else {
      rect.width = clamp(rect.width, minWidth, state.stageWidth);
      rect.height = clamp(rect.height, minHeight, state.stageHeight);
    }
    rect.x = clamp(rect.x, 0, state.stageWidth - rect.width);
    rect.y = clamp(rect.y, 0, state.stageHeight - rect.height);

    state.selection = {
      x: rect.x / state.stageWidth,
      y: rect.y / state.stageHeight,
      width: rect.width / state.stageWidth,
      height: rect.height / state.stageHeight
    };
    updateSelectionUi();
  }

  function updateSelectionUi() {
    if (!state.stageWidth || !state.stageHeight) return;

    const rect = getSelectionPixels();
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;

    Object.assign(el.selection.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });

    Object.assign(el.shadeTop.style, {
      left: "0px", top: "0px", width: `${state.stageWidth}px`, height: `${rect.y}px`
    });
    Object.assign(el.shadeBottom.style, {
      left: "0px", top: `${bottom}px`, width: `${state.stageWidth}px`, height: `${Math.max(0, state.stageHeight - bottom)}px`
    });
    Object.assign(el.shadeLeft.style, {
      left: "0px", top: `${rect.y}px`, width: `${rect.x}px`, height: `${rect.height}px`
    });
    Object.assign(el.shadeRight.style, {
      left: `${right}px`, top: `${rect.y}px`, width: `${Math.max(0, state.stageWidth - right)}px`, height: `${rect.height}px`
    });

    updateSizeInputs();
  }

  // PDF fields resize the crop; photo fields set the final print size.
  function updateSizeInputs() {
    if (!state.pageW || !state.pageH) return;
    const wMm = state.sourceKind === "image" ? state.photoWidthMm : state.selection.width * state.pageW * 25.4 / 72;
    const hMm = state.sourceKind === "image" ? state.photoHeightMm : state.selection.height * state.pageH * 25.4 / 72;
    const setV = (input, v) => { if (input && document.activeElement !== input) input.value = v.toFixed(1); };
    setV(el.ow2, wMm); setV(el.ow3, wMm);
    setV(el.oh2, hMm); setV(el.oh3, hMm);
  }

  function mirrorSizeInput(axis, input) {
    const twins = axis === "w" ? [el.ow2, el.ow3] : [el.oh2, el.oh3];
    twins.forEach(i => { if (i && i !== input) i.value = input.value; });
  }

  function commitSize(axis, input) {
    if (!state.pageW || !state.pageH) return;
    const raw = parseFloat(String(input.value).replace(",", "."));
    if (state.sourceKind === "image") {
      if (Number.isFinite(raw) && raw >= 20 && raw <= (axis === "w" ? 500 : 1000)) {
        if (axis === "w") state.photoWidthMm = raw;
        else state.photoHeightMm = raw;
        state.selection = photoSelection(state.selection);
      }
      input.value = (axis === "w" ? state.photoWidthMm : state.photoHeightMm).toFixed(1);
      updateSelectionUi();
      revokeGeneratedUrl();
      return;
    }
    if (Number.isFinite(raw) && raw > 0) {
      if (axis === "w") {
        const width = clamp(mmToPoints(raw) / state.pageW, 0.02, 1);
        const x = clamp(state.selection.x, 0, 1 - width);
        state.selection = { ...state.selection, x, width };
      } else {
        const height = clamp(mmToPoints(raw) / state.pageH, 0.02, 1);
        const y = clamp(state.selection.y, 0, 1 - height);
        state.selection = { ...state.selection, y, height };
      }
    }
    updateSelectionUi();
    revokeGeneratedUrl();
    if (state.step === 3) showResult();
  }

  function resetSelection() {
    if (!state.pdfPage) return;
    state.zoom = 1;
    state.selection = presetForCurrentRotation();
    renderPage();
    setStatus("");
  }

  function rotate(direction) {
    if (!state.pdfPage) return;
    state.userRotation = normalizeAngle(state.userRotation + direction);
    if (state.sourceKind === "image") {
      [state.photoWidthMm, state.photoHeightMm] = [state.photoHeightMm, state.photoWidthMm];
    }
    state.selection = direction > 0
      ? rotateSelectionCW(state.selection)
      : rotateSelectionCCW(state.selection);
    state.selection = photoSelection(state.selection);
    renderPage();
    setStatus("");
  }

  function applyZoom(factor) {
    if (!state.pdfPage) return;
    state.zoom = clamp(state.zoom * factor, 1, 5);
    renderPage();
  }

  function beginPointerSession(event) {
    if (!state.stageWidth || !state.stageHeight) return;

    const handle = event.target.closest("[data-handle]");
    const mode = handle ? handle.dataset.handle : "move";
    const rect = getSelectionPixels();

    state.pointerSession = {
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: { ...rect }
    };

    el.selection.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePointerSession(event) {
    const session = state.pointerSession;
    if (!session || session.pointerId !== event.pointerId) return;

    const dx = event.clientX - session.startClientX;
    const dy = event.clientY - session.startClientY;
    const start = session.startRect;
    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (session.mode === "move") {
      const width = start.width;
      const height = start.height;
      left = clamp(start.x + dx, 0, state.stageWidth - width);
      top = clamp(start.y + dy, 0, state.stageHeight - height);
      setSelectionFromPixels({ x: left, y: top, width, height });
      return;
    }

    if (photoAspectLocked()) {
      setSelectionFromPixels(PrintHelpers.resizeAspectRect(start, session.mode, dx, dy,
        { width: state.stageWidth, height: state.stageHeight }, state.photoWidthMm / state.photoHeightMm, MIN_SELECTION_PX));
      return;
    }

    if (session.mode.includes("w")) left = clamp(start.x + dx, 0, right - MIN_SELECTION_PX);
    if (session.mode.includes("e")) right = clamp(start.x + start.width + dx, left + MIN_SELECTION_PX, state.stageWidth);
    if (session.mode.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_SELECTION_PX);
    if (session.mode.includes("s")) bottom = clamp(start.y + start.height + dy, top + MIN_SELECTION_PX, state.stageHeight);

    setSelectionFromPixels({ x: left, y: top, width: right - left, height: bottom - top });
  }

  function endPointerSession(event) {
    if (!state.pointerSession || state.pointerSession.pointerId !== event.pointerId) return;
    state.pointerSession = null;
    try { el.selection.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
  }

  function nudgeSelection(event) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();

    const amount = event.shiftKey ? 5 : 1;
    const rect = getSelectionPixels();
    if (event.key === "ArrowLeft") rect.x -= amount;
    if (event.key === "ArrowRight") rect.x += amount;
    if (event.key === "ArrowUp") rect.y -= amount;
    if (event.key === "ArrowDown") rect.y += amount;
    setSelectionFromPixels(rect);
  }

  // --- Export ----------------------------------------------------------------

  async function buildOutputBytes() {
    const { PDFDocument, degrees, rgb } = PDFLib;
    const sourceBytes = state.sourceBytes.slice();
    const rotation = totalRotation();
    const sel = { ...state.selection };
    const isPhoto = state.sourceKind === "image";
    const photoWidthMm = state.photoWidthMm;
    const photoHeightMm = state.photoHeightMm;
    const paper = el.paperSize.value;
    const cropMarks = el.cropMarks.checked;
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const sourcePage = sourcePdf.getPage(0);
    const sourceWidth = sourcePage.getWidth();
    const sourceHeight = sourcePage.getHeight();

    // Map the selection (in the displayed, rotated image) back to the source page's
    // unrotated coordinate space, so the crop is correct regardless of rotation.
    const corners = [
      [sel.x, sel.y],
      [sel.x + sel.width, sel.y],
      [sel.x, sel.y + sel.height],
      [sel.x + sel.width, sel.y + sel.height]
    ].map(([nx, ny]) => mapDisplayToSource(nx, ny, rotation));

    const us = corners.map(p => p.u);
    const vs = corners.map(p => p.v);
    const left = Math.min(...us) * sourceWidth;
    const right = Math.max(...us) * sourceWidth;
    const top = (1 - Math.min(...vs)) * sourceHeight;
    const bottom = (1 - Math.max(...vs)) * sourceHeight;

    const outputPdf = await PDFDocument.create();
    const embeddedPage = await outputPdf.embedPage(sourcePage, { left, bottom, right, top });

    const embedWidth = right - left;
    const embedHeight = top - bottom;
    const swapped = rotation === 90 || rotation === 270;
    const displayWidth = swapped ? embedHeight : embedWidth;
    const displayHeight = swapped ? embedWidth : embedHeight;

    const widthMm = isPhoto ? photoWidthMm : displayWidth * 25.4 / 72;
    const heightMm = isPhoto ? photoHeightMm : displayHeight * 25.4 / 72;
    const layout = PrintHelpers.createPrintLayout(widthMm, heightMm, paper, cropMarks);
    const outputPage = outputPdf.addPage([mmToPoints(layout.pageWidth), mmToPoints(layout.pageHeight)]);
    const targetWidth = mmToPoints(widthMm);
    const targetHeight = mmToPoints(heightMm);
    const fit = PrintHelpers.containSize(displayWidth, displayHeight, targetWidth, targetHeight);
    const fitWidth = fit.width;
    const fitHeight = fit.height;
    const offsetX = mmToPoints(layout.x) + (targetWidth - fitWidth) / 2;
    const offsetY = mmToPoints(layout.y) + (targetHeight - fitHeight) / 2;

    // Place the source-oriented cutout rotated exactly as in the preview.
    // pdf-lib rotates counter-clockwise for positive degrees.
    let drawWidth;
    let drawHeight;
    let drawX;
    let drawY;
    let angle;
    switch (rotation) {
      case 90:
        drawWidth = fitHeight; drawHeight = fitWidth;
        drawX = offsetX; drawY = offsetY + fitHeight; angle = -90;
        break;
      case 180:
        drawWidth = fitWidth; drawHeight = fitHeight;
        drawX = offsetX + fitWidth; drawY = offsetY + fitHeight; angle = 180;
        break;
      case 270:
        drawWidth = fitHeight; drawHeight = fitWidth;
        drawX = offsetX + fitWidth; drawY = offsetY; angle = 90;
        break;
      default:
        drawWidth = fitWidth; drawHeight = fitHeight;
        drawX = offsetX; drawY = offsetY; angle = 0;
    }

    outputPage.drawPage(embeddedPage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
      rotate: degrees(angle)
    });

    for (const mark of layout.cropMarks) {
      outputPage.drawLine({
        start: { x: mmToPoints(mark.x1), y: mmToPoints(mark.y1) },
        end: { x: mmToPoints(mark.x2), y: mmToPoints(mark.y2) },
        thickness: 0.3,
        color: rgb(0, 0, 0)
      });
    }
    outputPdf.catalog.getOrCreateViewerPreferences().setPrintScaling(PDFLib.PrintScaling.None);

    outputPdf.setTitle(isPhoto ? "Parcel Cropper - photo" : "Parcel Cropper – etikett");
    outputPdf.setProducer("Parcel Cropper");
    outputPdf.setCreator("Parcel Cropper");

    return outputPdf.save({ useObjectStreams: false });
  }

  // Step 3: build the final label and show the actual output PDF.
  async function showResult() {
    if (!state.sourceBytes) return;
    if (state.resultBusy) {
      state.resultQueued = true;
      return;
    }
    state.resultBusy = true;
    el.nextButton.disabled = true;
    try {
      do {
        state.resultQueued = false;
        revokeGeneratedUrl();
        setStatus("Creating PDF…");
        try {
          const bytes = await buildOutputBytes();
          if (state.resultQueued || state.step !== 3) continue;
          await renderResult(bytes);
          if (state.resultQueued || state.step !== 3) continue;
          state.generatedUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          setStatus("");
        } catch (error) {
          if (state.resultQueued || state.step !== 3) continue;
          console.error(error);
          setStatus(error.message || "Could not create the PDF. Go back and try again.", "error");
        }
      } while (state.resultQueued && state.step === 3);
    } finally {
      state.resultBusy = false;
      el.nextButton.disabled = state.step === 3 && !state.generatedUrl;
    }
  }

  async function renderResult(bytes) {
    if (state.resultDoc) {
      try { state.resultDoc.destroy(); } catch (_) { /* no-op */ }
      state.resultDoc = null;
    }

    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    state.resultDoc = doc;
    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(1, el.resultPreview.clientWidth - 28);
    const availableHeight = Math.max(1, el.resultPreview.clientHeight - 28);
    const cssScale = Math.min(availableWidth / base.width, availableHeight / base.height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const cssViewport = page.getViewport({ scale: cssScale });
    const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

    el.resultCanvas.style.width = `${cssViewport.width}px`;
    el.resultCanvas.style.height = `${cssViewport.height}px`;
    el.resultCanvas.width = Math.ceil(renderViewport.width);
    el.resultCanvas.height = Math.ceil(renderViewport.height);
    await page.render({ canvasContext: el.resultCanvas.getContext("2d", { alpha: false }), viewport: renderViewport }).promise;
  }

  async function downloadResult() {
    if (!state.generatedUrl) await showResult();
    if (!state.generatedUrl) return;

    const link = document.createElement("a");
    link.href = state.generatedUrl;
    link.download = outputFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus("PDF downloaded.", "success");
  }

  // --- Events ----------------------------------------------------------------

  el.fileInput.addEventListener("change", () => loadFile(el.fileInput.files[0]));
  el.dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    el.dropZone.classList.add("drag");
  });
  el.dropZone.addEventListener("dragleave", () => el.dropZone.classList.remove("drag"));
  el.dropZone.addEventListener("drop", event => {
    event.preventDefault();
    el.dropZone.classList.remove("drag");
    loadFile(event.dataTransfer.files[0]);
  });

  el.selection.addEventListener("pointerdown", beginPointerSession);
  el.selection.addEventListener("pointermove", movePointerSession);
  el.selection.addEventListener("pointerup", endPointerSession);
  el.selection.addEventListener("pointercancel", endPointerSession);
  el.selection.addEventListener("keydown", nudgeSelection);

  el.rotateLeftButton.addEventListener("click", () => rotate(-90));
  el.rotateRightButton.addEventListener("click", () => rotate(90));
  el.zoomInButton.addEventListener("click", () => applyZoom(1.25));
  el.zoomOutButton.addEventListener("click", () => applyZoom(0.8));
  el.resetButton.addEventListener("click", resetSelection);
  el.cardPreset.addEventListener("click", () => {
    state.photoWidthMm = 63;
    state.photoHeightMm = 88;
    state.selection = photoSelection(state.selection);
    updateSelectionUi();
    revokeGeneratedUrl();
  });
  el.photoFit.addEventListener("change", () => {
    state.selection = presetForCurrentRotation();
    updateSelectionUi();
    revokeGeneratedUrl();
  });
  for (const input of [el.paperSize, el.cropMarks]) {
    input.addEventListener("change", () => {
      updateExportOptions();
      revokeGeneratedUrl();
      if (state.step === 3) showResult();
    });
  }
  const brandEl = document.getElementById("brand");
  if (brandEl) brandEl.addEventListener("click", () => goToStep(1));
  el.backButton.addEventListener("click", goBack);
  el.nextButton.addEventListener("click", primaryAction);

  // Result fields show the crop/photo size; paper is selected separately.
  [["w", el.ow2], ["h", el.oh2]].forEach(([axis, input]) => {
    if (!input) return;
    input.addEventListener("input", () => mirrorSizeInput(axis, input));
    input.addEventListener("change", () => commitSize(axis, input));
  });

  el.stepEls.forEach((li, index) => {
    const target = index + 1;
    const activate = () => { if (target === 1 || state.pdfPage) goToStep(target); };
    li.addEventListener("click", activate);
    li.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });

  window.addEventListener("resize", () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      if (state.pdfPage && state.step === 3) showResult();
      else if (state.pdfPage && state.step === 2) renderPage();
    }, 140);
  });

  window.addEventListener("beforeunload", revokeGeneratedUrl);

  renderStep();
})();

/* global pdfjsLib, PDFLib */
(() => {
  "use strict";

  if (typeof pdfjsLib === "undefined" || typeof PDFLib === "undefined") {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = "Kunde inte ladda nödvändiga bibliotek. Kontrollera din internetanslutning och ladda om sidan.";
      status.className = "status error";
    }
    return;
  }

  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  const elements = {
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    fileInfo: document.getElementById("fileInfo"),
    workspace: document.getElementById("workspace"),
    previewViewport: document.getElementById("previewViewport"),
    pageStage: document.getElementById("pageStage"),
    canvas: document.getElementById("pdfCanvas"),
    selection: document.getElementById("selection"),
    shadeTop: document.getElementById("shadeTop"),
    shadeRight: document.getElementById("shadeRight"),
    shadeBottom: document.getElementById("shadeBottom"),
    shadeLeft: document.getElementById("shadeLeft"),
    cropSize: document.getElementById("cropSize"),
    ratioStatus: document.getElementById("ratioStatus"),
    presetButton: document.getElementById("presetButton"),
    resetButton: document.getElementById("resetButton"),
    rotateLeftButton: document.getElementById("rotateLeftButton"),
    rotateRightButton: document.getElementById("rotateRightButton"),
    outputWidth: document.getElementById("outputWidth"),
    outputHeight: document.getElementById("outputHeight"),
    preserveAspect: document.getElementById("preserveAspect"),
    outputFilename: document.getElementById("outputFilename"),
    createButton: document.getElementById("createButton"),
    status: document.getElementById("status"),
    resultActions: document.getElementById("resultActions"),
    downloadButton: document.getElementById("downloadButton"),
    printButton: document.getElementById("printButton"),
    outputPreviewWrap: document.getElementById("outputPreviewWrap"),
    outputPreview: document.getElementById("outputPreview")
  };

  const DEFAULT_WIDTH_MM = 104.4;
  const DEFAULT_HEIGHT_MM = 187.8;

  // Beskärningsområdet innanför klippstrecken i den aktuella Tradera/PostNord-mallen.
  const PRESET = Object.freeze({ x: 0.020168, y: 0.140736, width: 0.469332, height: 0.624822 });
  const DEFAULT_SELECTION = Object.freeze({ x: 0.08, y: 0.12, width: 0.45, height: 0.65 });
  const MIN_SELECTION_PX = 30;

  const state = {
    file: null,
    sourceBytes: null,
    pdfDocument: null,
    pdfPage: null,
    pdfWidth: 0,
    pdfHeight: 0,
    stageWidth: 0,
    stageHeight: 0,
    baseRotation: 0,
    userRotation: 0,
    selection: { ...PRESET },
    generatedUrl: null,
    pointerSession: null,
    resizeTimer: null,
    isRendering: false,
    renderQueued: false
  };

  function cloneSelection(selection) {
    return { x: selection.x, y: selection.y, width: selection.width, height: selection.height };
  }

  function normalizeAngle(angle) {
    return ((angle % 360) + 360) % 360;
  }

  function totalRotation() {
    return normalizeAngle(state.baseRotation + state.userRotation);
  }

  // Rotera en normaliserad markering (y nedåt) tillsammans med innehållet.
  function rotateSelectionCW(s) {
    return { x: 1 - s.y - s.height, y: s.x, width: s.height, height: s.width };
  }

  function rotateSelectionCCW(s) {
    return { x: s.y, y: 1 - s.x - s.width, width: s.height, height: s.width };
  }

  function rotateSelection180(s) {
    return { x: 1 - s.x - s.width, y: 1 - s.y - s.height, width: s.width, height: s.height };
  }

  // Mappa en punkt i den visade (roterade) bilden till källsidans normaliserade
  // koordinater (u = vänster→höger, v = topp→botten).
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

  function pointsToMm(points) {
    return points * 25.4 / 72;
  }

  function normalizeFilename(filename) {
    const value = (filename || "fraktsedel-etikett.pdf").trim();
    const safe = value.replace(/[\\/:*?"<>|]+/g, "-");
    return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
  }

  function setStatus(message, type = "") {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`.trim();
  }

  function revokeGeneratedUrl() {
    if (state.generatedUrl) {
      URL.revokeObjectURL(state.generatedUrl);
      state.generatedUrl = null;
    }
    elements.resultActions.hidden = true;
    elements.outputPreviewWrap.hidden = true;
    elements.outputPreview.removeAttribute("src");
  }

  async function loadFile(file) {
    if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
      setStatus("Välj en PDF-fil.", "error");
      return;
    }

    revokeGeneratedUrl();
    setStatus("Läser PDF…");
    elements.createButton.disabled = true;

    try {
      // Läs in i lokala variabler och byt state först när allt lyckats, så att
      // ett misslyckande inte lämnar appen i ett inkonsekvent läge.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDocument = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pdfPage = await pdfDocument.getPage(1);

      if (state.pdfDocument) {
        try { state.pdfDocument.destroy(); } catch (_) { /* no-op */ }
      }

      state.file = file;
      state.sourceBytes = bytes;
      state.pdfDocument = pdfDocument;
      state.pdfPage = pdfPage;
      state.baseRotation = normalizeAngle(pdfPage.rotate || 0);
      state.userRotation = 180;
      state.selection = rotateSelection180(PRESET);

      elements.fileInfo.hidden = false;
      elements.fileInfo.textContent = `${file.name} • ${pdfDocument.numPages} sida${pdfDocument.numPages === 1 ? "" : "or"}`;
      elements.workspace.hidden = false;
      elements.outputFilename.value = `${file.name.replace(/\.pdf$/i, "")}-etikett.pdf`;

      await renderPage();
      setStatus("Rotera och markera etiketten, skapa sedan PDF:en.");
    } catch (error) {
      console.error(error);
      setStatus("PDF-filen kunde inte läsas. Kontrollera att den inte är lösenordsskyddad.", "error");
    } finally {
      elements.createButton.disabled = false;
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
      state.pdfWidth = scaleViewport.width;
      state.pdfHeight = scaleViewport.height;

      const availableWidth = Math.max(280, Math.min(950, elements.previewViewport.clientWidth - 30));
      const cssScale = availableWidth / scaleViewport.width;
      const cssViewport = state.pdfPage.getViewport({ scale: cssScale, rotation });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderViewport = state.pdfPage.getViewport({ scale: cssScale * pixelRatio, rotation });

      state.stageWidth = cssViewport.width;
      state.stageHeight = cssViewport.height;

      elements.pageStage.style.width = `${state.stageWidth}px`;
      elements.pageStage.style.height = `${state.stageHeight}px`;
      elements.canvas.style.width = `${state.stageWidth}px`;
      elements.canvas.style.height = `${state.stageHeight}px`;
      elements.canvas.width = Math.ceil(renderViewport.width);
      elements.canvas.height = Math.ceil(renderViewport.height);

      const context = elements.canvas.getContext("2d", { alpha: false });
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

    rect.width = clamp(rect.width, minWidth, state.stageWidth);
    rect.height = clamp(rect.height, minHeight, state.stageHeight);
    rect.x = clamp(rect.x, 0, state.stageWidth - rect.width);
    rect.y = clamp(rect.y, 0, state.stageHeight - rect.height);

    state.selection = {
      x: rect.x / state.stageWidth,
      y: rect.y / state.stageHeight,
      width: rect.width / state.stageWidth,
      height: rect.height / state.stageHeight
    };
    updateSelectionUi();
    revokeGeneratedUrl();
  }

  function updateSelectionUi() {
    if (!state.stageWidth || !state.stageHeight) return;

    const rect = getSelectionPixels();
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;

    Object.assign(elements.selection.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });

    Object.assign(elements.shadeTop.style, {
      left: "0px", top: "0px", width: `${state.stageWidth}px`, height: `${rect.y}px`
    });
    Object.assign(elements.shadeBottom.style, {
      left: "0px", top: `${bottom}px`, width: `${state.stageWidth}px`, height: `${Math.max(0, state.stageHeight - bottom)}px`
    });
    Object.assign(elements.shadeLeft.style, {
      left: "0px", top: `${rect.y}px`, width: `${rect.x}px`, height: `${rect.height}px`
    });
    Object.assign(elements.shadeRight.style, {
      left: `${right}px`, top: `${rect.y}px`, width: `${Math.max(0, state.stageWidth - right)}px`, height: `${rect.height}px`
    });

    updateCropMeta();
  }

  function updateCropMeta() {
    if (!state.pdfWidth || !state.pdfHeight) return;

    const cropWidthPt = state.selection.width * state.pdfWidth;
    const cropHeightPt = state.selection.height * state.pdfHeight;
    const cropWidthMm = pointsToMm(cropWidthPt);
    const cropHeightMm = pointsToMm(cropHeightPt);
    elements.cropSize.textContent = `Markering: ${cropWidthMm.toFixed(1)} × ${cropHeightMm.toFixed(1)} mm i originalet`;

    const outputWidth = Number(elements.outputWidth.value) || DEFAULT_WIDTH_MM;
    const outputHeight = Number(elements.outputHeight.value) || DEFAULT_HEIGHT_MM;
    const cropRatio = cropWidthPt / cropHeightPt;
    const outputRatio = outputWidth / outputHeight;
    const difference = Math.abs(cropRatio / outputRatio - 1) * 100;

    elements.ratioStatus.className = difference <= 1.5 ? "ok" : "warning";
    elements.ratioStatus.textContent = difference <= 1.5
      ? "Proportionerna stämmer"
      : `Proportionerna skiljer ${difference.toFixed(1)} %`;
  }

  function applyPreset() {
    if (!state.pdfPage) return;
    state.userRotation = 180;
    state.selection = rotateSelection180(PRESET);
    renderPage();
    revokeGeneratedUrl();
    setStatus("Preset tillämpad – etiketten vänds rätt och rutan ligger innanför klippstrecken.");
  }

  function resetSelection() {
    if (!state.pdfPage) return;
    state.userRotation = 0;
    state.selection = cloneSelection(DEFAULT_SELECTION);
    renderPage();
    revokeGeneratedUrl();
    setStatus("Markering och rotation återställda.");
  }

  function rotate(direction) {
    if (!state.pdfPage) return;
    state.userRotation = normalizeAngle(state.userRotation + direction);
    state.selection = direction > 0
      ? rotateSelectionCW(state.selection)
      : rotateSelectionCCW(state.selection);
    renderPage();
    revokeGeneratedUrl();
    setStatus(`Roterad till ${totalRotation()}°.`);
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

    elements.selection.setPointerCapture(event.pointerId);
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

    if (session.mode.includes("w")) left = clamp(start.x + dx, 0, right - MIN_SELECTION_PX);
    if (session.mode.includes("e")) right = clamp(start.x + start.width + dx, left + MIN_SELECTION_PX, state.stageWidth);
    if (session.mode.includes("n")) top = clamp(start.y + dy, 0, bottom - MIN_SELECTION_PX);
    if (session.mode.includes("s")) bottom = clamp(start.y + start.height + dy, top + MIN_SELECTION_PX, state.stageHeight);

    setSelectionFromPixels({ x: left, y: top, width: right - left, height: bottom - top });
  }

  function endPointerSession(event) {
    if (!state.pointerSession || state.pointerSession.pointerId !== event.pointerId) return;
    state.pointerSession = null;
    try { elements.selection.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ }
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

  async function createOutputPdf() {
    if (!state.sourceBytes) {
      setStatus("Välj först en PDF-fil.", "error");
      return;
    }

    const outputWidthMm = Number(elements.outputWidth.value);
    const outputHeightMm = Number(elements.outputHeight.value);
    if (!Number.isFinite(outputWidthMm) || !Number.isFinite(outputHeightMm) || outputWidthMm <= 0 || outputHeightMm <= 0) {
      setStatus("Ange giltig bredd och höjd.", "error");
      return;
    }

    elements.createButton.disabled = true;
    revokeGeneratedUrl();
    setStatus("Skapar PDF…");

    try {
      const { PDFDocument, degrees } = PDFLib;
      const sourcePdf = await PDFDocument.load(state.sourceBytes.slice());
      const sourcePage = sourcePdf.getPage(0);
      const sourceWidth = sourcePage.getWidth();
      const sourceHeight = sourcePage.getHeight();

      // Mappa markeringen (i den visade, roterade bilden) tillbaka till källsidans
      // oroterade koordinatrum, så att beskärningen blir rätt oavsett rotation.
      const rotation = totalRotation();
      const sel = state.selection;
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

      const outputWidth = mmToPoints(outputWidthMm);
      const outputHeight = mmToPoints(outputHeightMm);
      const outputPage = outputPdf.addPage([outputWidth, outputHeight]);

      let fitWidth = outputWidth;
      let fitHeight = outputHeight;
      let offsetX = 0;
      let offsetY = 0;
      if (elements.preserveAspect.checked) {
        const scale = Math.min(outputWidth / displayWidth, outputHeight / displayHeight);
        fitWidth = displayWidth * scale;
        fitHeight = displayHeight * scale;
        offsetX = (outputWidth - fitWidth) / 2;
        offsetY = (outputHeight - fitHeight) / 2;
      }

      // Placera det (källorienterade) utsnittet så att det visas roterat exakt som
      // i förhandsvisningen. pdf-lib roterar moturs för positiva grader.
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

      outputPdf.setTitle("Beskuren fraktsedel");
      outputPdf.setProducer("Fraktsedelsklippare - client-side");
      outputPdf.setCreator("Fraktsedelsklippare");

      const pdfBytes = await outputPdf.save({ useObjectStreams: false });
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      state.generatedUrl = URL.createObjectURL(blob);

      const filename = normalizeFilename(elements.outputFilename.value);
      elements.outputFilename.value = filename;
      elements.downloadButton.href = state.generatedUrl;
      elements.downloadButton.download = filename;
      elements.outputPreview.src = state.generatedUrl;
      elements.resultActions.hidden = false;
      elements.outputPreviewWrap.hidden = false;
      setStatus("PDF skapad. Kontrollera förhandsvisningen innan utskrift.", "success");
    } catch (error) {
      console.error(error);
      setStatus("PDF:en kunde inte skapas. Prova att ladda om sidan och välj filen igen.", "error");
    } finally {
      elements.createButton.disabled = false;
    }
  }

  function openForPrint() {
    if (!state.generatedUrl) return;
    const opened = window.open(state.generatedUrl, "_blank", "noopener,noreferrer");
    if (!opened) setStatus("Webbläsaren blockerade det nya fönstret. Tillåt popup-fönster och försök igen.", "error");
  }

  elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));
  elements.dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    elements.dropZone.classList.add("dragover");
  });
  elements.dropZone.addEventListener("dragleave", () => elements.dropZone.classList.remove("dragover"));
  elements.dropZone.addEventListener("drop", event => {
    event.preventDefault();
    elements.dropZone.classList.remove("dragover");
    loadFile(event.dataTransfer.files[0]);
  });

  elements.selection.addEventListener("pointerdown", beginPointerSession);
  elements.selection.addEventListener("pointermove", movePointerSession);
  elements.selection.addEventListener("pointerup", endPointerSession);
  elements.selection.addEventListener("pointercancel", endPointerSession);
  elements.selection.addEventListener("keydown", nudgeSelection);

  elements.presetButton.addEventListener("click", applyPreset);
  elements.resetButton.addEventListener("click", resetSelection);
  elements.rotateLeftButton.addEventListener("click", () => rotate(-90));
  elements.rotateRightButton.addEventListener("click", () => rotate(90));
  elements.createButton.addEventListener("click", createOutputPdf);
  elements.printButton.addEventListener("click", openForPrint);
  elements.outputWidth.addEventListener("input", () => { updateCropMeta(); revokeGeneratedUrl(); });
  elements.outputHeight.addEventListener("input", () => { updateCropMeta(); revokeGeneratedUrl(); });
  elements.preserveAspect.addEventListener("change", revokeGeneratedUrl);

  window.addEventListener("resize", () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => renderPage(), 140);
  });

  window.addEventListener("beforeunload", revokeGeneratedUrl);
})();

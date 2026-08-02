/* global pdfjsLib, PDFLib */
(() => {
  "use strict";

  const statusEl = document.getElementById("status");
  function setStatus(message, type = "") {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`.trim();
  }

  if (typeof pdfjsLib === "undefined" || typeof PDFLib === "undefined") {
    setStatus("Kunde inte ladda nödvändiga bibliotek. Kontrollera internet och ladda om sidan.", "error");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const OUTPUT_WIDTH_MM = 104.4;
  const OUTPUT_HEIGHT_MM = 187.8;
  const MIN_SELECTION_PX = 30;
  const STEPS = 3;

  // Beskärningsområdet innanför klippstrecken i den aktuella Tradera/PostNord-mallen.
  const PRESET = Object.freeze({ x: 0.020168, y: 0.140736, width: 0.469332, height: 0.624822 });

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
    downloadButton: document.getElementById("downloadButton"),
    backButton: document.getElementById("backButton"),
    nextButton: document.getElementById("nextButton"),
    nav: document.querySelector(".nav")
  };

  const state = {
    step: 1,
    sourceBytes: null,
    sourceName: "",
    pdfDocument: null,
    pdfPage: null,
    stageWidth: 0,
    stageHeight: 0,
    baseRotation: 0,
    userRotation: 0,
    zoom: 1,
    selection: { ...PRESET },
    generatedUrl: null,
    resultDoc: null,
    pointerSession: null,
    resizeTimer: null,
    isRendering: false,
    renderQueued: false
  };

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

  // Presetrutan uttryckt i den aktuella rotationens visningsram.
  function presetForCurrentRotation() {
    let s = { ...PRESET };
    const turns = normalizeAngle(state.userRotation) / 90;
    for (let i = 0; i < turns; i++) s = rotateSelectionCW(s);
    return s;
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

  function outputFilename() {
    const base = (state.sourceName || "fraktsedel").replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]+/g, "-");
    return `${base}-etikett.pdf`;
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
    el.nextButton.hidden = !((s === 1 && state.pdfPage) || s === 2);
    el.nextButton.textContent = s === 1 ? "Fortsätt" : "Nästa";
    el.downloadButton.hidden = s !== 3;
    el.nav.hidden = el.backButton.hidden && el.nextButton.hidden && el.downloadButton.hidden;

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

  // --- Inläsning & rendering -------------------------------------------------

  async function loadFile(file) {
    if (!file || (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"))) {
      setStatus("Välj en PDF-fil.", "error");
      return;
    }

    setStatus("Läser PDF…");

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdfDocument = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const pdfPage = await pdfDocument.getPage(1);

      if (state.pdfDocument) {
        try { state.pdfDocument.destroy(); } catch (_) { /* no-op */ }
      }

      state.sourceBytes = bytes;
      state.sourceName = file.name;
      state.pdfDocument = pdfDocument;
      state.pdfPage = pdfPage;
      state.baseRotation = normalizeAngle(pdfPage.rotate || 0);
      state.userRotation = 0;
      state.zoom = 1;
      state.selection = { ...PRESET };

      goToStep(2);
    } catch (error) {
      console.error(error);
      setStatus("PDF-filen kunde inte läsas. Kontrollera att den inte är lösenordsskyddad.", "error");
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

      // Passa in i den lediga ytan (bredd + höjd) och multiplicera med zoom.
      const availableWidth = Math.max(240, el.preview.clientWidth - 28);
      const availableHeight = Math.max(240, el.preview.clientHeight - 28);
      const fitScale = Math.min(availableWidth / scaleViewport.width, availableHeight / scaleViewport.height);
      const cssScale = fitScale * state.zoom;
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
    state.selection = direction > 0
      ? rotateSelectionCW(state.selection)
      : rotateSelectionCCW(state.selection);
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

    const outputWidth = mmToPoints(OUTPUT_WIDTH_MM);
    const outputHeight = mmToPoints(OUTPUT_HEIGHT_MM);
    const outputPage = outputPdf.addPage([outputWidth, outputHeight]);

    // Centrera med bibehållna proportioner (ingen förvrängning av streckkoder).
    const scale = Math.min(outputWidth / displayWidth, outputHeight / displayHeight);
    const fitWidth = displayWidth * scale;
    const fitHeight = displayHeight * scale;
    const offsetX = (outputWidth - fitWidth) / 2;
    const offsetY = (outputHeight - fitHeight) / 2;

    // Placera det källorienterade utsnittet roterat exakt som i förhandsvisningen.
    // pdf-lib roterar moturs för positiva grader.
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

    return outputPdf.save({ useObjectStreams: false });
  }

  // Steg 3: bygg den färdiga etiketten och visa den riktiga utdata-PDF:en.
  async function showResult() {
    if (!state.sourceBytes) return;
    setStatus("Skapar etikett…");
    try {
      const bytes = await buildOutputBytes();
      revokeGeneratedUrl();
      state.generatedUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      await renderResult(bytes);
      setStatus("Skriv ut i faktisk storlek – ingen skalning.");
    } catch (error) {
      console.error(error);
      setStatus("Kunde inte skapa etiketten. Gå tillbaka och försök igen.", "error");
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
    const availableWidth = Math.max(200, el.resultPreview.clientWidth - 28);
    const availableHeight = Math.max(200, el.resultPreview.clientHeight - 28);
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
    setStatus("Etikett nedladdad.", "success");
  }

  // --- Händelser -------------------------------------------------------------

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
  el.downloadButton.addEventListener("click", downloadResult);
  el.backButton.addEventListener("click", goBack);
  el.nextButton.addEventListener("click", goNext);

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
    state.resizeTimer = setTimeout(() => renderPage(), 140);
  });

  window.addEventListener("beforeunload", revokeGeneratedUrl);

  renderStep();
})();

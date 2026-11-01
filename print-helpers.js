((root, factory) => {
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  else root.PrintHelpers = helpers;
})(globalThis, () => {
  "use strict";

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mmToPoints = mm => mm * 72 / 25.4;

  function fitAspectRect(rect, bounds, ratio) {
    const width = Math.min(rect.width, rect.height * ratio, bounds.width, bounds.height * ratio);
    const height = width / ratio;
    return {
      x: clamp(rect.x + (rect.width - width) / 2, 0, bounds.width - width),
      y: clamp(rect.y + (rect.height - height) / 2, 0, bounds.height - height),
      width,
      height
    };
  }

  function resizeAspectRect(start, handle, dx, dy, bounds, ratio, minSize = 30) {
    const horizontal = handle.includes("e") || handle.includes("w");
    const vertical = handle.includes("n") || handle.includes("s");
    const anchorX = handle.includes("w") ? start.x + start.width
      : handle.includes("e") ? start.x : start.x + start.width / 2;
    const anchorY = handle.includes("n") ? start.y + start.height
      : handle.includes("s") ? start.y : start.y + start.height / 2;
    const desiredWidth = start.width + (handle.includes("w") ? -dx : dx);
    const desiredHeight = start.height + (handle.includes("n") ? -dy : dy);
    let width = horizontal && vertical
      ? (desiredWidth + desiredHeight / ratio) / (1 + 1 / (ratio * ratio))
      : horizontal ? desiredWidth : desiredHeight * ratio;
    const maxWidth = handle.includes("w") ? anchorX
      : handle.includes("e") ? bounds.width - anchorX
      : 2 * Math.min(anchorX, bounds.width - anchorX);
    const maxHeight = handle.includes("n") ? anchorY
      : handle.includes("s") ? bounds.height - anchorY
      : 2 * Math.min(anchorY, bounds.height - anchorY);
    const max = Math.min(maxWidth, maxHeight * ratio);
    width = clamp(width, Math.min(max, Math.max(minSize, minSize * ratio)), max);
    const height = width / ratio;
    return {
      x: handle.includes("w") ? anchorX - width : horizontal ? anchorX : anchorX - width / 2,
      y: handle.includes("n") ? anchorY - height : vertical ? anchorY : anchorY - height / 2,
      width,
      height
    };
  }

  function containSize(width, height, targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / width, targetHeight / height);
    return { width: width * scale, height: height * scale };
  }

  function createPrintLayout(width, height, paper = "crop", marks = false) {
    if (![width, height].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error("Enter a valid width and height.");
    }
    let pageWidth = width;
    let pageHeight = height;
    if (paper === "a4") {
      if (width <= 190 && height <= 277) {
        pageWidth = 210;
        pageHeight = 297;
      } else if (width <= 277 && height <= 190) {
        pageWidth = 297;
        pageHeight = 210;
      } else {
        throw new Error("This size does not fit on A4. Choose Sized PDF or a smaller size.");
      }
    } else if (paper !== "crop") {
      throw new Error("Choose a valid paper size.");
    }
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;
    const cropMarks = [];
    if (paper === "a4" && marks) {
      for (const markX of [x, x + width]) {
        cropMarks.push({ x1: markX, y1: y - 5, x2: markX, y2: y - 2 });
        cropMarks.push({ x1: markX, y1: y + height + 2, x2: markX, y2: y + height + 5 });
      }
      for (const markY of [y, y + height]) {
        cropMarks.push({ x1: x - 5, y1: markY, x2: x - 2, y2: markY });
        cropMarks.push({ x1: x + width + 2, y1: markY, x2: x + width + 5, y2: markY });
      }
    }
    return { pageWidth, pageHeight, x, y, width, height, cropMarks };
  }

  return { mmToPoints, fitAspectRect, resizeAspectRect, containSize, createPrintLayout };
});

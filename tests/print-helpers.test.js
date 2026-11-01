const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mmToPoints, fitAspectRect, resizeAspectRect, containSize, createPrintLayout } = require("../print-helpers.js");

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("millimetres convert to PDF points without rounding the print size", () => {
  close(mmToPoints(25.4), 72);
  close(mmToPoints(63) * 25.4 / 72, 63);
  close(mmToPoints(88) * 25.4 / 72, 88);
});

test("sized PDF is exactly the requested size and has no outside marks", () => {
  const layout = createPrintLayout(63, 88, "crop", true);
  assert.deepEqual([layout.pageWidth, layout.pageHeight, layout.x, layout.y], [63, 88, 0, 0]);
  assert.equal(layout.cropMarks.length, 0);
});

test("A4 centres a card without scaling it and defaults to no crop marks", () => {
  const layout = createPrintLayout(63, 88, "a4");
  assert.deepEqual([layout.pageWidth, layout.pageHeight, layout.x, layout.y], [210, 297, 73.5, 104.5]);
  assert.deepEqual([layout.width, layout.height], [63, 88]);
  assert.equal(layout.cropMarks.length, 0);
});

test("optional crop marks align with the card and remain outside the photo", () => {
  const layout = createPrintLayout(63, 88, "a4", true);
  assert.equal(layout.cropMarks.length, 8);
  for (const mark of layout.cropMarks) {
    assert.ok([mark.x1, mark.x2].every(x => x >= 0 && x <= 210));
    assert.ok([mark.y1, mark.y2].every(y => y >= 0 && y <= 297));
    assert.ok(Math.max(mark.x1, mark.x2) < layout.x || Math.min(mark.x1, mark.x2) > layout.x + 63
      || Math.max(mark.y1, mark.y2) < layout.y || Math.min(mark.y1, mark.y2) > layout.y + 88);
    close(Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1), 3);
  }
  assert.ok(layout.cropMarks.some(mark => mark.x1 === layout.x && mark.y2 === layout.y - 2));
  assert.ok(layout.cropMarks.some(mark => mark.x1 === layout.x + 63 && mark.y1 === layout.y + 90));
});

test("wide output selects landscape A4 and oversized output is rejected", () => {
  const layout = createPrintLayout(250, 150, "a4", true);
  assert.deepEqual([layout.pageWidth, layout.pageHeight], [297, 210]);
  assert.throws(() => createPrintLayout(300, 300, "a4"), /does not fit/);
  for (const size of [0, -1, NaN, Infinity]) assert.throws(() => createPrintLayout(size, 88), /valid width/);
});

test("a wide photo gets a centred portrait crop with the print aspect ratio", () => {
  const bounds = { width: 674, height: 645 };
  const rect = fitAspectRect({ x: 0, y: 0, ...bounds }, bounds, 63 / 88);
  close(rect.width / rect.height, 63 / 88);
  close(rect.height, 645);
  close(rect.x + rect.width / 2, 337);
  close(rect.y, 0);
});

test("fitting the whole photo preserves its aspect ratio inside the card", () => {
  const horse = containSize(674, 645, 63, 88);
  close(horse.width, 63);
  close(horse.width / horse.height, 674 / 645);
  assert.ok(horse.height < 88);
  const dog = containSize(1076, 2048, 63, 88);
  close(dog.height, 88);
  close(dog.width / dog.height, 1076 / 2048);
  assert.ok(dog.width < 63);
});

for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
  test(`resizing ${handle} preserves print aspect and stays inside the image`, () => {
    const start = { x: 100, y: 40, width: 126, height: 176 };
    const bounds = { width: 400, height: 300 };
    for (const dx of [-1000, -20, 0, 20, 1000]) {
      for (const dy of [-1000, -20, 0, 20, 1000]) {
        const rect = resizeAspectRect(start, handle, dx, dy, bounds, 63 / 88);
        close(rect.width / rect.height, 63 / 88);
        assert.ok(rect.width > 0 && rect.height > 0);
        assert.ok(rect.x >= -1e-8 && rect.y >= -1e-8);
        assert.ok(rect.x + rect.width <= bounds.width + 1e-8);
        assert.ok(rect.y + rect.height <= bounds.height + 1e-8);
        if (handle.includes("w")) close(rect.x + rect.width, start.x + start.width);
        if (handle.includes("e")) close(rect.x, start.x);
        if (handle.includes("n")) close(rect.y + rect.height, start.y + start.height);
        if (handle.includes("s")) close(rect.y, start.y);
      }
    }
  });
}

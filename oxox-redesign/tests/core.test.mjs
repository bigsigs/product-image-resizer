import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOutputName,
  createStoredZip,
  dedupeNames,
  formatBytes,
  normalizeQuality,
  sanitizeStem
} from "../public/webp-converter/core.js";

test("sanitizeStem keeps useful Unicode while removing unsafe filename characters", () => {
  assert.equal(sanitizeStem("  产品 主图_01?.jpg  "), "产品-主图-01.jpg");
  assert.equal(sanitizeStem('a<b>c:d"e/f\\g|h*i'), "a-b-c-d-e-f-g-h-i");
  assert.equal(sanitizeStem("..."), "image");
});

test("buildOutputName preserves the original stem by default", () => {
  assert.equal(
    buildOutputName({ mode: "original", originalName: "产品 主图.JPG", index: 1 }),
    "产品-主图.webp"
  );
});

test("buildOutputName creates padded sequences from a custom start number", () => {
  assert.equal(
    buildOutputName({
      mode: "sequence",
      originalName: "anything.png",
      index: 3,
      base: "sku A32",
      start: 7,
      digits: 3
    }),
    "sku-A32-009.webp"
  );
});

test("buildOutputName expands naming template variables", () => {
  assert.equal(
    buildOutputName({
      mode: "template",
      originalName: "front view.png",
      index: 2,
      template: "{name}-{index:03}-{width}x{height}-{date}",
      width: 1200,
      height: 800,
      date: "2026-07-29"
    }),
    "front-view-002-1200x800-2026-07-29.webp"
  );
});

test("buildOutputName applies prefix and suffix without duplicating the extension", () => {
  assert.equal(
    buildOutputName({
      mode: "original",
      originalName: "sample.webp",
      index: 1,
      prefix: "new ",
      suffix: " final.webp"
    }),
    "new-sample-final.webp"
  );
});

test("dedupeNames resolves collisions case-insensitively", () => {
  assert.deepEqual(
    dedupeNames(["Photo.webp", "photo.webp", "photo-2.webp", "PHOTO.webp"]),
    ["Photo.webp", "photo-2.webp", "photo-2-2.webp", "PHOTO-3.webp"]
  );
});

test("normalizeQuality clamps percent input to a safe WebP range", () => {
  assert.equal(normalizeQuality(5), 0.4);
  assert.equal(normalizeQuality(82), 0.82);
  assert.equal(normalizeQuality(120), 1);
  assert.equal(normalizeQuality("bad"), 0.82);
});

test("formatBytes returns readable sizes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");
});

test("createStoredZip produces a valid ZIP envelope containing UTF-8 filenames and bytes", () => {
  const zip = createStoredZip([
    { name: "产品-01.webp", data: new Uint8Array([1, 2, 3, 4]) },
    { name: "sample.webp", data: new Uint8Array([5, 6]) }
  ]);

  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...zip.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);

  const decoded = new TextDecoder().decode(zip);
  assert.match(decoded, /产品-01\.webp/);
  assert.match(decoded, /sample\.webp/);
});

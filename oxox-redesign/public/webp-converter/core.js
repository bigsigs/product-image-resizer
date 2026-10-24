const encoder = new TextEncoder();

export function sanitizeStem(value, fallback = "image") {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-\./g, ".")
    .replace(/^[.\-]+|[.\-]+$/g, "");

  return cleaned || fallback;
}

function stripExtension(name) {
  return String(name ?? "").replace(/\.[^./\\]+$/, "");
}

function stripWebp(name) {
  return String(name ?? "").replace(/\.webp$/i, "");
}

function padIndex(value, digits) {
  return String(value).padStart(Math.max(1, Math.min(6, Number(digits) || 2)), "0");
}

export function buildOutputName({
  mode = "original",
  originalName = "image",
  index = 1,
  base = "image",
  start = 1,
  digits = 2,
  template = "{name}-{index:02}",
  prefix = "",
  suffix = "",
  width = "",
  height = "",
  date = new Date().toISOString().slice(0, 10)
} = {}) {
  const originalStem = sanitizeStem(stripExtension(originalName));
  const sequenceNumber = Math.max(0, Number(start) || 0) + Math.max(0, Number(index) - 1 || 0);
  let stem;

  if (mode === "sequence") {
    stem = `${sanitizeStem(base)}-${padIndex(sequenceNumber, digits)}`;
  } else if (mode === "template") {
    stem = String(template || "{name}-{index:02}")
      .replace(/\{original\}/gi, originalStem)
      .replace(/\{name\}/gi, originalStem)
      .replace(/\{index(?::(\d+))?\}/gi, (_, size) => padIndex(index, size || digits))
      .replace(/\{width\}/gi, width || "width")
      .replace(/\{height\}/gi, height || "height")
      .replace(/\{date\}/gi, date);
  } else {
    stem = originalStem;
  }

  const safePrefix = prefix ? `${sanitizeStem(stripWebp(prefix), "")}-` : "";
  const safeSuffix = suffix ? `-${sanitizeStem(stripWebp(suffix), "")}` : "";
  return `${sanitizeStem(`${safePrefix}${stripWebp(stem)}${safeSuffix}`)}.webp`;
}

export function dedupeNames(names) {
  const used = new Set();

  return names.map(rawName => {
    const safeName = buildOutputName({ originalName: rawName });
    const base = stripExtension(safeName);
    let candidate = safeName;
    let counter = 2;

    while (used.has(candidate.toLocaleLowerCase())) {
      candidate = `${base}-${counter}.webp`;
      counter += 1;
    }

    used.add(candidate.toLocaleLowerCase());
    return candidate;
  });
}

export function normalizeQuality(value) {
  const parsed = Number(value);
  const percent = Number.isFinite(parsed) ? parsed : 82;
  return Math.min(1, Math.max(0.4, percent / 100));
}

export function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;

  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${Number(size.toFixed(1))} ${units[unit]}`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeU32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(sanitizeStem(entry.name).replace(/\.webp$/i, "") + ".webp");
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const checksum = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0x0800);
    writeU16(localView, 8, 0);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, data.length);
    writeU32(localView, 22, data.length);
    writeU16(localView, 26, name.length);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0x0800);
    writeU16(centralView, 10, 0);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, data.length);
    writeU32(centralView, 24, data.length);
    writeU16(centralView, 28, name.length);
    writeU32(centralView, 42, localOffset);
    central.set(name, 46);
    centralParts.push(central);

    localOffset += local.length + data.length;
  }

  const centralDirectory = concat(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 8, entries.length);
  writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralDirectory.length);
  writeU32(endView, 16, localOffset);

  return concat([...localParts, centralDirectory, end]);
}

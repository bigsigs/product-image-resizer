#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidatesDir = path.join(root, ".logo-candidates");
const candidatesFile = path.join(candidatesDir, "candidates.json");
const outputDir = path.join(root, "public/company-icons/verified");
const manifestFile = path.join(root, "src/data/verified-company-icons.json");
const reviewFile = path.join(root, "review/company-enrichment/logo-selection.json");
const candidates = JSON.parse(fs.readFileSync(candidatesFile, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const rejects = new Set([
  "YQ000005", // favicon is a near-empty micro mark
  "YQ000037", // source file is a white wordmark with no suitable light-background version
  "YQ000042", // current favicon is a crop, not the company wordmark
  "YQ000097", // favicon is too small and indistinct
  "YQ000101", // domain was only listed by a third-party registry; ownership is not confirmed
  "YQ000136", // favicon is too small and indistinct
  "YQ000206", // chosen image is a page banner, not a compact brand mark
  "YQ000241", // image includes page art rather than a clean logo lockup
  "YQ000278", // supplied logo has transparent white lettering
  "YQ000399", // ybw.cn is an industry directory asset, not a company-owned logo
  "YQ000418", // generated storefront icon does not identify the company
  "YQ000025", // selected image is an OEM/ODM/OBM service label, not a logo
  "YQ000108", // selected image is an isolated emblem without a readable brand lockup
  "YQ000126", // selected image is a low-contrast site watermark
  "YQ000319", // selected image is a tiny favicon crop
  "YQ000372", // selected image is a low-resolution marketplace icon
  "YQ000388", // source artwork is cropped to “E·LINDER” and is missing the left side
  "YQ000111", // wordmark is fully transparent white and disappears on the light card
  "YQ000146", // wordmark is fully transparent white on the source site
  "YQ000020", // favicon is an isolated emblem without a readable company name
  "YQ000049", // crop includes multiple unrelated marks and is illegible at card size
  "YQ000124", // wordmark is too faint on a light background
  "YQ000155", // wordmark is too faint and too wide at card size
  "YQ000162", // selected artwork is a watermark rather than a compact logo
  "YQ000170", // cropped wordmark starts mid-name and is illegible at card size
  "YQ000231", // full page banner is too wide and unreadable in the icon card
  "YQ000295", // full-header artwork is too wide and unreadable in the icon card
  "YQ000299", // wordmark is too faint on a light background
  "YQ000354", // full-header artwork is illegible in the icon card
  "YQ000297", // wordmark is too faint on a light background
  "YQ000021", // group website is not curated as the subsidiary's own official website
  "YQ000050", // wordmark is too faint on a light card
  "YQ000183", // group website is not curated as the subsidiary's own official website
  "YQ000249", // radin.cn belongs to a different legal entity
  "YQ000265", // domain is only a medium-confidence candidate, not a verified official site
]);
for (const id of rejects) {
  delete manifest[id];
  for (const filename of fs.readdirSync(outputDir)) {
    if (filename.startsWith(`${id}.`)) fs.rmSync(path.join(outputDir, filename), { force: true });
  }
}

// A page-level logo label is strong evidence, but social cards and large banners
// are routinely tagged the same way. These thresholds reject those cases while
// still allowing compact header marks and square favicons.
const isImage = (file) => {
  if (file.toLowerCase().endsWith(".svg")) return true;
  try {
    execFileSync("identify", [file], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const dimensions = (file) => {
  let output;
  try {
    output = execFileSync("identify", [
      "-format", "%w\t%h\t%m\t%[opaque]",
      file,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    if (!file.toLowerCase().endsWith(".svg")) throw error;
    const svg = fs.readFileSync(file, "utf8");
    const viewBox = svg.match(/\bviewBox=["']([^"']+)["']/i)?.[1]?.trim().split(/[\s,]+/);
    const width = svg.match(/\bwidth=["']([\d.]+)/i)?.[1] ?? viewBox?.[2];
    const height = svg.match(/\bheight=["']([\d.]+)/i)?.[1] ?? viewBox?.[3];
    if (!width || !height) throw error;
    return [String(Math.round(Number(width))), String(Math.round(Number(height))), "SVG", "False"];
  }
  return output.split("\n")[0].split("\t");
};
const acceptable = (candidate, size) => {
  const width = Number(size[0]);
  const height = Number(size[1]);
  const kind = size[2].toUpperCase();
  const opaque = size[3] === "True";
  if (!width || !height || width < 32 || height < 20) return false;
  if (opaque && width * height > 900_000) return false;
  if (!opaque && width * height > 3_200_000) return false;
  if (candidate.kind === "favicon") return width >= 32 && height >= 32;
  if (candidate.kind === "social-image") return false;
  const ratio = width / height;
  if (ratio < 0.45 || ratio > 12) return false;
  if (height < 28 && ratio < 1.2) return false;
  if (kind === "SVG") return true;
  if (candidate.score >= 100 && width >= 60) return true;
  if (candidate.score >= 80 && width >= 90) return true;
  return false;
};

const normalize = (raw, kind, id) => {
  const output = path.join(outputDir, `${id}.${kind.toLowerCase() === "svg" ? "svg" : "png"}`);
  if (kind.toUpperCase() === "SVG") {
    fs.copyFileSync(raw, output);
    return;
  }
  execFileSync("magick", [
    raw,
    "-background", "none",
    "-gravity", "center",
    "-trim", "+repage",
    "-resize", "192x192>",
    "-extent", "192x192",
    "-strip",
    `PNG32:${output}`,
  ], { stdio: "ignore" });
};

const usedOrigins = new Map();
const selections = [];
for (const entity of candidates) {
  if (rejects.has(entity.id)) continue;
  if (!entity.candidates?.length) continue;
  const selected = entity.candidates.find((candidate) => {
    const raw = path.join(candidatesDir, candidate.filename);
    if (!fs.existsSync(raw) || !isImage(raw)) return false;
    return acceptable(candidate, dimensions(raw));
  });
  if (!selected) continue;
  const raw = path.join(candidatesDir, selected.filename);
  const [width, height, kind] = dimensions(raw);
  normalize(raw, kind, entity.id);
  const extension = kind.toUpperCase() === "SVG" ? "svg" : "png";
  const darkBackground = manifest[entity.id]?.dark_background ?? false;
  manifest[entity.id] = {
    path: `/company-icons/verified/${entity.id}.${extension}`,
    source_url: selected.final_url,
    page_url: entity.website,
    checked_at: "2026-10-24",
    dark_background: darkBackground,
  };
  usedOrigins.set(new URL(selected.final_url).hostname, entity.id);
  selections.push({
    id: entity.id,
    name: entity.name,
    website: entity.website,
    selected_file: selected.filename,
    source_url: selected.final_url,
    width: Number(width),
    height: Number(height),
    score: selected.score,
    kind: selected.kind,
  });
}

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(path.dirname(reviewFile), { recursive: true });
fs.writeFileSync(manifestFile, `${JSON.stringify(
  Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b))),
  null,
  2,
)}\n`);
fs.writeFileSync(reviewFile, `${JSON.stringify(selections, null, 2)}\n`);

console.log(JSON.stringify({
  manifestIcons: Object.keys(manifest).length,
  newlySelected: selections.length,
  svg: selections.filter((row) => row.kind === "editorial-svg" || row.selected_file.endsWith(".svg")).length,
  review: path.relative(root, reviewFile),
}, null, 2));

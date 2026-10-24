#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, ".logo-candidates");
const reportFile = path.join(outputDir, "candidates.json");
const reviewDir = path.join(root, "review/company-enrichment");
const researchDir = path.join(reviewDir, "top500");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const decode = (value) => String(value ?? "")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const absoluteUrl = (value, base) => {
  try {
    const url = new URL(decode(value), base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const firstWebsite = (value) => String(value ?? "")
  .split(/\s*\|\s*|\s*[；;]\s*/)
  .map((item) => item.trim())
  .find(Boolean) ?? "";
const slug = (value) => value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "");
const extFrom = (url, contentType = "") => {
  const pathname = new URL(url).pathname.toLowerCase();
  const match = pathname.match(/\.(svg|png|webp|jpe?g|gif)$/);
  if (match) return match[1] === "jpeg" ? "jpg" : match[1];
  if (/svg/.test(contentType)) return "svg";
  if (/png/.test(contentType)) return "png";
  if (/webp/.test(contentType)) return "webp";
  if (/jpe?g/.test(contentType)) return "jpg";
  if (/gif/.test(contentType)) return "gif";
  return "img";
};

const entities = new Map();
const add = (row) => {
  const id = row.id ?? row["企业ID"];
  const name = row.name ?? row["企业名称"];
  const website = firstWebsite(row.website ?? row["官网"]);
  if (!id || !name || !website || entities.has(id)) return;
  entities.set(id, { id, name, website });
};
for (const file of ["top100-review.json", "top100-supplemental.json"]) {
  const full = path.join(reviewDir, file);
  if (!fs.existsSync(full)) continue;
  for (const row of readJson(full)) {
    if (row["状态"] !== "待核实") add(row);
  }
}
if (fs.existsSync(researchDir)) {
  for (const file of fs.readdirSync(researchDir).filter((name) => /^research-.*\.json$/.test(name)).sort()) {
    for (const row of readJson(path.join(researchDir, file))) add(row);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
for (const name of fs.readdirSync(outputDir)) {
  if (name !== path.basename(reportFile)) fs.rmSync(path.join(outputDir, name), { recursive: true, force: true });
}

const htmlCandidates = (html, baseUrl) => {
  const scored = [];
  const addCandidate = (raw, score, kind) => {
    const url = absoluteUrl(raw, baseUrl);
    if (url) scored.push({ url, score, kind });
  };
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attributes = match[1];
    const attrs = Object.fromEntries([...attributes.matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
    )].map((item) => [item[1].toLowerCase(), decode(item[2] ?? item[3] ?? item[4] ?? "")]));
    for (const raw of [attrs.src, attrs["data-src"], attrs["data-original"], attrs["data-lazy-src"]]) {
      if (!raw) continue;
      const context = `${match[0]} ${attributes.slice(0, 500)}`.toLowerCase();
      let score = 0;
      if (/\b(?:logo|brand|company-mark|site-logo)\b/.test(context)) score += 80;
      if (/\balt\s*=\s*["'][^"']*(?:logo|标志|品牌|官网)/i.test(match[0])) score += 50;
      if (/\bclass\s*=\s*["'][^"']*logo/i.test(match[0])) score += 35;
      if (/\b(?:header|top|head)\b/.test(context)) score += 5;
      if (/\.svg(?:[?#]|$)/i.test(raw)) score += 8;
      if (score > 0) addCandidate(raw, score, "site-logo");
    }
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[1].matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
    )].map((item) => [item[1].toLowerCase(), decode(item[2] ?? item[3] ?? item[4] ?? "")]));
    if (!attrs.href) continue;
    const rel = String(attrs.rel ?? "").toLowerCase();
    if (/\bicon\b/.test(rel)) addCandidate(attrs.href, rel.includes("apple") ? 32 : 20, "favicon");
  }
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...match[1].matchAll(
      /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi,
    )].map((item) => [item[1].toLowerCase(), decode(item[2] ?? item[3] ?? item[4] ?? "")]));
    if (/^(?:og:image|twitter:image)$/i.test(attrs.property ?? attrs.name ?? "") && attrs.content) {
      addCandidate(attrs.content, 10, "social-image");
    }
  }
  const seen = new Set();
  return scored
    .filter((candidate) => {
      if (seen.has(candidate.url)) return false;
      seen.add(candidate.url);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

const fetchWithTimeout = async (url, timeout = 15000) => fetch(url, {
  redirect: "follow",
  signal: AbortSignal.timeout(timeout),
  headers: {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    accept: "text/html,application/xhtml+xml,image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.7",
  },
});

const results = [];
const queue = [...entities.values()];
const worker = async () => {
  for (;;) {
    const entity = queue.shift();
    if (!entity) return;
    const result = { ...entity, status: "no_candidate", candidates: [], note: "" };
    try {
      const response = await fetchWithTimeout(entity.website);
      result.final_url = response.url;
      result.http_status = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") ?? "";
      if (!/html|xml/i.test(contentType)) throw new Error(`unexpected content type ${contentType}`);
      const html = await response.text();
      const candidates = htmlCandidates(html, response.url);
      for (const candidate of candidates.slice(0, 6)) {
        try {
          const image = await fetchWithTimeout(candidate.url);
          const imageType = image.headers.get("content-type") ?? "";
          if (!image.ok || !/image|svg/i.test(imageType)) continue;
          const data = Buffer.from(await image.arrayBuffer());
          if (data.length < 160 || data.length > 3_000_000) continue;
          const filename = `${entity.id}-${String(result.candidates.length + 1).padStart(2, "0")}-${slug(new URL(image.url).hostname)}.${extFrom(image.url, imageType)}`;
          fs.writeFileSync(path.join(outputDir, filename), data);
          result.candidates.push({
            ...candidate,
            filename,
            bytes: data.length,
            content_type: imageType,
            final_url: image.url,
          });
        } catch (error) {
          result.candidate_errors ??= [];
          result.candidate_errors.push(`${candidate.url}: ${error.message}`);
        }
      }
      if (result.candidates.length) result.status = "candidates_downloaded";
      else result.note = "Page loaded, but no usable logo/icon image was found.";
    } catch (error) {
      result.status = "fetch_failed";
      result.note = error.message;
    }
    results.push(result);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(reportFile, `${JSON.stringify(results, null, 2)}\n`);

console.log(JSON.stringify({
  companiesWithWebsites: entities.size,
  pagesFetched: results.filter((row) => row.http_status === 200).length,
  companiesWithCandidates: results.filter((row) => row.candidates.length).length,
  candidateImages: results.reduce((sum, row) => sum + row.candidates.length, 0),
  fetchFailures: results.filter((row) => row.status === "fetch_failed").length,
  report: path.relative(root, reportFile),
}, null, 2));

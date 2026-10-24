import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await read(path));
const companyPath = (id) => `/yueqing-export-ranking/company/${id}/`;
const builtPath = (path) => `dist${path}index.html`;
const dataPath = "public/data/yueqing-export-ranking/";
const publicRoutes = [
  "/", "/yueqing-export-ranking/", "/yueqing-seo/", "/articles/",
  "/tools/", "/about-data/", "/product-image-resizer/", "/webp-converter/",
];

const decodeHtml = (value) => String(value)
  .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const textOf = (html) => decodeHtml(html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const compactText = (value) => String(value).replace(/\s+/g, "");
const attributesOf = (html) => Object.fromEntries([...html.matchAll(
  /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
)].map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? "")]));
const anchorsOf = (html) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
  .map((match) => ({ ...attributesOf(match[1]), text: textOf(match[2]) }));
const tagsOf = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "gi"))]
  .map((match) => attributesOf(match[1]));
const hasId = (html, id) => new RegExp(`\\bid=["']${id}["']`).test(html);
const mainOf = (html) => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";

function elementById(html, id) {
  const start = new RegExp(`<([a-z][\\w:-]*)\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i").exec(html);
  assert.ok(start, `missing #${id}`);
  const tag = start[1];
  if (["input", "img", "br", "hr", "meta", "link"].includes(tag.toLowerCase())) return start[0];
  const tokens = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
  tokens.lastIndex = start.index;
  let depth = 0;
  for (let token; (token = tokens.exec(html));) {
    depth += token[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start.index, tokens.lastIndex);
  }
  assert.fail(`unclosed #${id}`);
}

function schemaNodes(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => attributesOf(match[1]).type === "application/ld+json")
    .flatMap((match) => {
      const schema = JSON.parse(match[2]);
      return schema["@graph"] ?? [schema];
    });
}

function assertCanonical(html, path) {
  const canonical = tagsOf(html, "link").filter((link) => link.rel === "canonical");
  assert.equal(canonical.length, 1, `${path} needs one canonical URL`);
  assert.equal(canonical[0].href, new URL(path, "https://oxox.cn").href);
}

function assertSafeExternalLinks(html, label) {
  for (const link of anchorsOf(html)) {
    assert.doesNotMatch(link.href ?? "", /^\s*(?:javascript|data|vbscript):/i, `${label}: unsafe link`);
    if (!/^https?:\/\//i.test(link.href ?? "") || link.target !== "_blank") continue;
    const rel = new Set((link.rel ?? "").split(/\s+/));
    assert.ok(rel.has("noopener") && rel.has("noreferrer"), `${label}: ${link.href} needs secure rel tokens`);
  }
}

test("the build and sitemap preserve every public route and stable company URL", async () => {
  const [sitemap, robots, companies] = await Promise.all([
    read("dist/sitemap.xml"), read("dist/robots.txt"), readJson(`${dataPath}companies.json`),
  ]);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(decodeHtml(match[1])));
  const paths = new Set(urls.map((url) => url.pathname));
  assert.equal(paths.size, urls.length, "sitemap URLs must be unique");
  for (const path of [...publicRoutes, ...companies.map((company) => companyPath(company.company_id))]) {
    assert.ok(paths.has(path), `sitemap is missing ${path}`);
  }
  await Promise.all(urls.map(async (url) => {
    assert.equal(url.origin, "https://oxox.cn");
    await access(new URL(builtPath(url.pathname), root));
  }));
  assert.match(robots, /Sitemap:\s*https:\/\/oxox\.cn\/sitemap\.xml/);
});

test("primary built pages retain canonical URLs, structured data and shared navigation", async () => {
  for (const path of publicRoutes) {
    const html = await read(builtPath(path));
    assert.match(html, /<!doctype html>/i, path);
    assertCanonical(html, path);
    assert.ok(schemaNodes(html).length, `${path} needs valid JSON-LD`);
    assert.match(html, /<header\b/i, `${path} needs site navigation`);
    assert.ok(anchorsOf(html).some((link) => link.href === "/"), `${path} needs a home link`);
    assertSafeExternalLinks(html, path);
  }
  const expectedTypes = {
    "/": "WebSite", "/yueqing-export-ranking/": "Dataset", "/yueqing-seo/": "Dataset",
    "/articles/": "CollectionPage", "/product-image-resizer/": "SoftwareApplication", "/webp-converter/": "SoftwareApplication",
  };
  for (const [path, type] of Object.entries(expectedTypes)) {
    const nodes = schemaNodes(await read(builtPath(path)));
    assert.ok(nodes.some((node) => [node["@type"]].flat().includes(type)), `${path} needs ${type} JSON-LD`);
  }
});

test("the homepage publishes the real first thirty companies before JavaScript runs", async () => {
  const [html, periods] = await Promise.all([read("dist/index.html"), readJson(`${dataPath}periods.json`)]);
  const period = periods.periods.find((item) => item.id === periods.latest);
  const dataset = await readJson(`${dataPath}${period.file}`);
  const links = anchorsOf(elementById(html, "rankingRows"))
    .filter((link) => /^\/yueqing-export-ranking\/company\/YQ\d+\/$/.test(link.href));
  assert.ok(links.length >= 30, "initial HTML must expose at least thirty real company links");
  dataset.records.slice(0, 30).forEach((record, index) => {
    assert.equal(links[index].href, companyPath(record.company_id));
    assert.ok(links[index].text.includes(record.company_name), `row ${index + 1} needs the source company name`);
    assert.ok(compactText(links[index].text).includes(compactText(record.amount_label || record.band_label)), `row ${index + 1} needs its source amount label`);
  });
  const main = mainOf(html);
  const summary = textOf(main.slice(0, main.indexOf('id="rankingSearch"')));
  const text = textOf(main);
  assert.ok(text.includes(period.label));
  assert.ok(summary.includes(dataset.records.length.toLocaleString("zh-CN")), "summary needs the source record count before the search");
  assert.match(summary, new RegExp(`(?:^|\\D)${dataset.bands.length}(?:\\D|$)`), "summary needs the source amount-band count");
  assert.match(summary, new RegExp(`(?:^|\\D)${periods.periods.length}(?:\\D|$)`), "summary needs the source period count");
  assert.match(text, /累计/);
  assert.match(text, /区间/);
  assert.match(text, /第 43 名/);
  assert.match(text, /缺号|未提供/);
  assert.doesNotMatch(text, /2026年7月出口额排名|2026年6月出口额排名|进出口额排名/);
});

test("homepage controls expose search, every source period, categories and further results", async () => {
  const [html, periods] = await Promise.all([read("dist/index.html"), readJson(`${dataPath}periods.json`)]);
  const search = tagsOf(html, "input").find((input) => input.id === "rankingSearch");
  assert.ok(search);
  assert.equal(search.type, "search");
  assert.match(`${search.placeholder ?? ""} ${search["aria-label"] ?? ""}`, /企业|公司/);
  const options = [...elementById(html, "periodSelect").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({ ...attributesOf(match[1]), text: textOf(match[2]) }));
  for (const period of periods.periods) {
    const option = options.find((item) => item.value === period.id);
    assert.ok(option, `period switch is missing ${period.id}`);
    assert.ok(option.text.includes(period.label));
  }
  assert.equal((options.find((option) => "selected" in option) ?? options[0]).value, periods.latest);
  assert.ok(tagsOf(elementById(html, "rankTabs"), "button").length > 1, "ranking categories need usable controls");
  assert.ok(tagsOf(html, "button").some((button) => button.id === "loadMore"), "further results need an explicit button");
  const modules = tagsOf(html, "script").filter((script) => script.type === "module" && script.src?.startsWith("/_astro/"));
  assert.ok(modules.length, "ranking controls need their built client module");
  await Promise.all(modules.map((script) => access(new URL(`dist${script.src}`, root))));
});

test("homepage keeps the missing rank note outside the dynamic period label", async () => {
  const html = await read("dist/index.html");
  const gap = elementById(html, "sourceGapNote");
  assert.match(textOf(gap), /第 43 名/);
  assert.doesNotMatch(elementById(html, "rankingPeriod"), /第 43 名/);
  const scripts = tagsOf(html, "script").filter((script) => script.type === "module" && script.src?.startsWith("/_astro/"));
  const source = (await Promise.all(scripts.map((script) => read(`dist${script.src}`)))).join("\n");
  assert.match(source, /pageshow/);
  assert.match(source, /persisted/);
});

test("homepage keeps reports and utilities in the menu and their independent pages", async () => {
  const html = await read("dist/index.html");
  const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i)?.[1] ?? "";
  for (const path of ["/articles/", "/tools/", "/yueqing-seo/", "/about-data/"]) {
    assert.ok(anchorsOf(header).some((link) => link.href === path), `header menu needs ${path}`);
  }
  const main = mainOf(html);
  assert.ok(main, "homepage needs a main content region");
  assert.doesNotMatch(main, /id=["'](?:auxiliary-tools|data-capabilities)["']|LATEST REPORT\s*\/\s*最新月报/);
  for (const link of anchorsOf(main)) {
    assert.doesNotMatch(link.href ?? "", /^\/(?:product-image-resizer|webp-converter)\/|^\/articles\/.+\/$/, "homepage should focus on the ranking");
  }
  const tools = anchorsOf(mainOf(await read("dist/tools/index.html")));
  for (const path of ["/product-image-resizer/", "/webp-converter/"]) {
    assert.ok(tools.some((link) => link.href === path), `tool directory needs ${path}`);
  }
});

test("company pages preserve stable identity, source histories and genuine zero amounts", async () => {
  const [companies, periods] = await Promise.all([
    readJson(`${dataPath}companies.json`), readJson(`${dataPath}periods.json`),
  ]);
  const datasets = await Promise.all(periods.periods.map(async (period) => ({
    period, dataset: await readJson(`${dataPath}${period.file}`),
  })));
  for (const id of ["YQ000001", "YQ003159", "YQ003742", "YQ001153", "YQ000091"]) {
    const company = companies.find((item) => item.company_id === id);
    const html = await read(builtPath(companyPath(id)));
    assertCanonical(html, companyPath(id));
    const nodes = schemaNodes(html);
    for (const type of ["WebPage", "Dataset", "BreadcrumbList"]) {
      assert.ok(nodes.some((node) => node["@type"] === type), `${id} needs ${type} JSON-LD`);
    }
    assert.ok(textOf(html).includes(company.company_name));
    assert.ok(textOf(html).includes(id));
    const expected = datasets.flatMap(({ period, dataset }) => dataset.records
      .filter((record) => record.company_id === id).map((record) => ({ period, record })));
    const panelStart = html.indexOf(elementById(html, "history-title"));
    const primaryHistory = html.slice(panelStart);
    const visibleTableHtml = primaryHistory.slice(0, primaryHistory.indexOf('<details class="older-history"'));
    const rows = [...visibleTableHtml.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)]
      .map((match) => ({ ...attributesOf(match[1]), text: textOf(match[2]) }))
      .filter((row) => row["data-period-id"]);
    const latestAsOf = expected.reduce(
      (latest, item) => item.period.as_of > latest ? item.period.as_of : latest,
      "",
    );
    const visibleExpected = expected.filter(({ period }) => period.as_of === latestAsOf);
    assert.equal(rows.length, visibleExpected.length, `${id}: main history table must show only the latest month`);
    for (const { period, record } of expected) {
      const amount = record.amount_label ?? record.band_label ?? "未提供";
      assert.ok(
        compactText(textOf(html)).includes(compactText(amount.replace(/\s+/g, ""))),
        `${id}: preserve folded source amount ${period.id}`,
      );
    }
    visibleExpected.forEach(({ period, record }, index) => {
      assert.equal(rows[index]["data-period-id"], period.id);
      const periodLabel = period.label.replace(/（精准数值）|（区间数据）/g, "");
      assert.ok(rows[index].text.includes(periodLabel), `${id}: preserve the cumulative period`);
      assert.match(rows[index].text, record.amount_label ? /精准数值/ : /金额区间|出口额区间/);
      assert.ok(rows[index].text.includes(record.amount_label || record.band_label), `${id}: preserve the source amount`);
      if (record.source_duplicate) assert.match(rows[index].text, /待核对|来源重复|重复记录|源表多条/);
    });
    if (new Set(expected.map(({ period }) => period.as_of)).size > 1) {
      assert.match(html, /查看历史月份/, `${id}: older months must remain available behind the history disclosure`);
    }
    if (id === "YQ003159") assert.ok(textOf(html).includes("（0 万美元）"), "a confirmed zero amount is valid data");
    if (id === "YQ003742") {
      assert.equal(rows.length, 1);
      assert.doesNotMatch(textOf(mainOf(html)), /[（(]\s*0(?:\.0+)?\s*万美元\s*[）)]|(?:NO\.|#)\s*0\b/);
    }
    assertSafeExternalLinks(html, id);
  }
});

test("curated company links and verified company facts survive the redesign", async () => {
  const [profiles, companies] = await Promise.all([
    readJson(`${dataPath}company-profiles.json`), readJson(`${dataPath}companies.json`),
  ]);
  const identities = new Set(companies.map((company) => company.company_id));
  for (const [id, profile] of Object.entries(profiles)) {
    assert.ok(identities.has(id), `${id} must belong to a stable company identity`);
    const html = await read(builtPath(companyPath(id)));
    const links = anchorsOf(mainOf(html));
    for (const source of profile.links ?? []) {
      if (!["http:", "https:"].includes(new URL(source.url).protocol)) continue;
      const link = links.find((item) => item.href === source.url);
      assert.ok(link, `${id}: preserve curated link ${source.url}`);
      assert.ok((link.rel ?? "").split(/\s+/).includes("nofollow"), `${id}: curated websites need nofollow`);
    }
    if (profile.details) {
      const text = textOf(mainOf(html));
      for (const field of ["legal_name", "unified_social_credit_code", "legal_representative", "registered_address"]) {
        if (profile.details[field]) assert.ok(text.includes(profile.details[field]), `${id}: preserve verified ${field}`);
      }
    }
    assertSafeExternalLinks(html, id);
  }
});

test("reviewed company overrides remain visible on production detail pages", async () => {
  const expectations = {
    YQ000175: [
      "浙江邦吉电气有限公司",
      "https://www.bjenclosure.com/",
      "浙江省乐清市象阳镇路头石村",
      "500万元人民币",
      "配电箱、壁挂箱、落地柜",
    ],
    YQ000176: ["浙江博升新材料技术有限公司", "金属易撕盖、易拉盖及罐头包装材料"],
    YQ000190: ["博尔斯顿电气有限公司", "https://www.boerstn.com/"],
    YQ000205: [
      "浙江信基电气股份有限公司",
      "https://www.singi.com/",
      "浙江省乐清经济开发区纬十二路148号东首",
      "2288万元人民币",
      "低压电器、智能转换开关、双电源自动转换开关",
    ],
  };
  for (const [id, needles] of Object.entries(expectations)) {
    const html = await read(builtPath(companyPath(id)));
    const body = mainOf(html);
    for (const needle of needles) assert.ok(body.includes(needle), `${id}: missing reviewed fact ${needle}`);
    assert.doesNotMatch(textOf(body), /公开资料未确认门牌|新材料技术\/材料制品（公开资料不足）|币种\/金额可能不完整/);
  }
  const boerstn = textOf(mainOf(await read(builtPath(companyPath("YQ000190")))));
  assert.doesNotMatch(boerstn, /5000元人民币/);
});

test("company facts panels show public-facing copy without internal research notes", async () => {
  for (const id of ["YQ000175", "YQ000176", "YQ000190", "YQ000205"]) {
    const html = await read(builtPath(companyPath(id)));
    const start = html.indexOf('class="detail-panel facts-panel"');
    assert.ok(start >= 0, `${id}: missing facts panel`);
    const factsPanel = html.slice(start, html.indexOf("</section>", start));
    const text = textOf(factsPanel);
    assert.match(text, /企业信息按公开资料整理；空白项表示暂未收录。/);
    assert.doesNotMatch(text, /未找到官网|待核对|候选|检索|精确匹配|公开资料不足/);
  }
});

test("verified company icons use a website curated for the same company", async () => {
  const [icons, profiles] = await Promise.all([
    readJson("src/data/verified-company-icons.json"),
    readJson(`${dataPath}company-profiles.json`),
  ]);
  const normalizedHost = (value) => new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  for (const [id, icon] of Object.entries(icons)) {
    const profile = profiles[id];
    assert.ok(profile, `${id}: icon has no company profile`);
    const officialHosts = new Set((profile.links ?? [])
      .filter((link) => ["official_website", "official_website_alt"].includes(link.type))
      .map((link) => normalizedHost(link.url)));
    assert.ok(officialHosts.size, `${id}: icon has no curated official website`);
    assert.ok(officialHosts.has(normalizedHost(icon.page_url)), `${id}: icon page ${icon.page_url} is not its curated official website`);
    await access(new URL(`public${icon.path}`, root));
  }
});

test("the existing ranking page retains its query, period and comparison controls", async () => {
  const [html, periods] = await Promise.all([
    read("dist/yueqing-export-ranking/index.html"), readJson(`${dataPath}periods.json`),
  ]);
  for (const id of ["rankingSearch", "periodSelect", "bandFilter", "topFilter", "rankingTableBody", "pagination"]) {
    assert.ok(hasId(html, id), `existing ranking page needs #${id}`);
  }
  const options = tagsOf(elementById(html, "periodSelect"), "option");
  for (const period of periods.periods) assert.ok(options.some((option) => option.value === period.id));
  const text = textOf(html);
  for (const needle of ["累计", "区间", "精准", "万美元", "较去年同期"]) assert.ok(text.includes(needle), needle);
  assert.doesNotMatch(text, /2026年7月出口额排名|2026年6月出口额排名|进出口额排名/);
});

test("SEO rankings retain their search controls and estimated-data qualification", async () => {
  const html = await read("dist/yueqing-seo/index.html");
  for (const id of ["seoSearch", "seoFilter", "seoSort", "seoRows"]) assert.ok(hasId(html, id), id);
  const text = textOf(html);
  for (const needle of ["乐清 SEO", "Semrush", "Google Search Console", "第三方估算数据", "不代表企业真实流量"]) {
    assert.ok(text.includes(needle), `SEO page needs ${needle}`);
  }
  assert.ok(anchorsOf(elementById(html, "seoRows")).some((link) => /^https?:\/\//.test(link.href)), "SEO records need their real domain links");
  assertSafeExternalLinks(html, "SEO rankings");
});

test("image tools preserve their working controls and shipped client assets", async () => {
  const resizer = await read("dist/product-image-resizer/index.html");
  const converter = await read("dist/webp-converter/index.html");
  for (const id of ["dropZone", "editModal"]) assert.ok(hasId(resizer, id), `resizer needs #${id}`);
  assert.match(textOf(resizer), /全部导出 WebP/);
  for (const id of ["dropZone", "nameTemplate"]) assert.ok(hasId(converter, id), `converter needs #${id}`);
  assert.ok(tagsOf(converter, "script").some((script) => script.src === "/webp-converter/app.js"));
  await Promise.all(["dist/webp-converter/app.js", "dist/webp-converter/core.js"].map((path) => access(new URL(path, root))));
});

test("the data explanation keeps cumulative, range, exact and missing-data meanings distinct", async () => {
  const text = textOf(mainOf(await read("dist/about-data/index.html")));
  for (const needle of ["累计", "区间", "精准", "万美元"]) assert.ok(text.includes(needle), `data explanation needs ${needle}`);
  assert.match(text, /单月/);
  assert.match(text, /缺失|未收录|暂无|未提供/);
  assert.match(text, /待核对|重复/);
});

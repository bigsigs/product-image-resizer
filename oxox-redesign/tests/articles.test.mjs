import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const sectionHeadings = [
  "一、外贸进出口情况概况",
  "二、外贸企业情况",
  "三、出口产品情况",
  "四、出口市场情况",
  "五、外贸进口情况",
];

test("article center publishes monthly reports in period order", async () => {
  const html = await read("dist/articles/index.html");
  const augustTitle = "乐清市 2026 年 1—8 月外贸情况分析";
  const julyTitle = "乐清市 2026 年 1—7 月外贸情况分析";
  const h1Title = "乐清市 2026 年 1—6 月外贸情况分析";
  const mayTitle = "乐清市 2026 年 1—5 月外贸情况分析";

  assert.ok(html.indexOf(augustTitle) < html.indexOf(julyTitle));
  assert.ok(html.indexOf(julyTitle) < html.indexOf(h1Title));
  assert.ok(html.indexOf(h1Title) < html.indexOf(mayTitle));
  assert.match(html, /月报/);
  assert.match(html, /href="\/articles\/yueqing-foreign-trade-2026-jan-aug\/"/);
  assert.match(html, /href="\/articles\/yueqing-foreign-trade-2026-jan-jul\/"/);
  assert.match(html, /href="\/articles\/yueqing-foreign-trade-2026-h1\/"/);
  assert.match(html, /href="\/articles\/yueqing-foreign-trade-2026-jan-may\/"/);
});

test("January-August report publishes the complete reviewed data contract", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-jan-aug/index.html");

  assert.match(html, /乐清市 2026 年 1—8 月外贸情况分析/);
  for (const heading of sectionHeadings) assert.ok(html.includes(heading), heading);
  assert.match(html, /246\.82 亿元/);
  assert.match(html, /238\.59 亿元/);
  assert.match(html, /8\.24 亿元/);
  assert.match(html, /205 个国家（地区）/);
  assert.equal((html.match(/<table/g) || []).length, 7);
  assert.match(html, /2026 年 1—8 月主要出口商品情况表/);
  assert.match(html, /1,182,458/);
  assert.match(html, /2026 年 1—8 月主要进口商品情况表/);
  assert.match(html, /2026 年 1—8 月镇（街道）进出口总额情况表/);
  assert.match(html, /2026 年 1—8 月温州各县（市、区）进出口情况表/);
  assert.match(html, /原进口表标题误写为“1—7 月”/);
  assert.doesNotMatch(html, /数据来源|整理：|作者：/);
});

test("January-July report publishes the complete reviewed data contract", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-jan-jul/index.html");

  assert.match(html, /乐清市 2026 年 1—7 月外贸情况分析/);
  for (const heading of sectionHeadings) assert.ok(html.includes(heading), heading);
  assert.match(html, /215\.09 亿元/);
  assert.match(html, /208\.69 亿元/);
  assert.match(html, /6\.40 亿元/);
  assert.match(html, /204 个国家（地区）/);
  assert.equal((html.match(/<table/g) || []).length, 7);
  assert.match(html, /2026 年 1—7 月主要出口商品情况表/);
  assert.match(html, /1,031,794/);
  assert.match(html, /2026 年 1—7 月主要进口商品情况表/);
  assert.match(html, /2026 年 1—7 月镇（街道）进出口总额情况表/);
  assert.match(html, /2,150,814/);
  assert.match(html, /2026 年 1—7 月镇（街道）出口总额情况表/);
  assert.match(html, /2,086,786/);
  assert.match(html, /2026 年 1—7 月温州各县（市、区）进出口情况表/);
  assert.match(html, /1,771\.87/);
  assert.match(html, /分类企业数量合计为 2,953 家/);
  assert.match(html, /机床出口额 9,035 万元/);
  assert.doesNotMatch(html, /数据来源|整理：|作者：/);
});

test("January-June report preserves its confirmed data contract", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-h1/index.html");

  assert.match(html, /乐清市 2026 年 1—6 月外贸情况分析/);
  assert.match(html, /核心看点/);
  for (const heading of sectionHeadings) assert.ok(html.includes(heading), heading);
  assert.match(html, /href="#analysis"/);
  assert.match(html, /href="#full-data"/);
  assert.match(html, /完整数据/);
  assert.equal((html.match(/<table/g) || []).length, 7);
  assert.match(html, /2026 年 1—6 月主要出口贸易国（地区）情况表/);
  assert.match(html, /1—6 月出口额/);
  assert.match(html, /180\.86 亿元/);
  assert.match(html, /175\.92 亿元/);
  assert.match(html, /122\.66 亿元/);
  assert.match(html, /203 个国家（地区）/);
  assert.doesNotMatch(html, /数据来源|整理：|作者：/);
});

test("January-June report publishes the complete corrected data appendix", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-h1/index.html");

  assert.match(html, /2026 年 1—6 月主要出口商品情况表/);
  assert.match(html, /蓄电池/);
  assert.match(html, /8,666\.85/);
  assert.match(html, /\+150\.24/);
  assert.match(html, /2026 年 1—6 月主要进口商品情况表/);
  assert.match(html, /静止式变流器/);
  assert.match(html, /玻璃及其制品/);
  assert.match(html, /2026 年 1—6 月镇（街道）进出口总额情况表/);
  assert.match(html, /2026 年 1—6 月镇（街道）出口总额情况表/);
  assert.match(html, /1,808,650/);
  assert.match(html, /1,759,225/);
  assert.match(html, /2026 年 1—6 月温州各县（市、区）进出口情况表/);
  assert.match(html, /海洋经济发展示范区/);
  assert.match(html, /1,507\.55/);
  assert.match(html, /全市合计按当期全市统计口径统一/);
});

test("January-May report preserves its intentionally mixed country-table label", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-jan-may/index.html");

  assert.match(html, /乐清市 2026 年 1—5 月外贸情况分析/);
  assert.match(html, /核心看点/);
  for (const heading of sectionHeadings) assert.ok(html.includes(heading), heading);
  assert.equal((html.match(/<table/g) || []).length, 4);
  assert.match(html, /2026 年 1—5 月主要出口贸易国（地区）情况表/);
  assert.match(html, /1—4 月出口额/);
  assert.match(html, /同比下降 2\.06%/);
  assert.match(html, /农产品、塑料制品、铁合金/);
  assert.match(html, /2,789 家/);
  assert.doesNotMatch(html, /数据来源|整理：|作者：/);
});

test("article UI exposes structured data and the confirmed trend colors", async () => {
  const html = await read("dist/articles/yueqing-foreign-trade-2026-h1/index.html");
  const cssFiles = (await readdir(new URL("dist/_astro/", root))).filter((name) => name.endsWith(".css"));
  const css = (await Promise.all(cssFiles.map((name) => read(`dist/_astro/${name}`)))).join("\n");

  assert.match(html, /"@type":"Article"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(css, /\.trend-up[^{]*\{[^}]*color:\s*var\(--orange\)/s);
  assert.match(css, /\.trend-down[^{]*\{[^}]*color:\s*var\(--green\)/s);
  assert.match(css, /\.data-table-wrap[^{]*\{[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(html, /"author"|"publisher"/);
});

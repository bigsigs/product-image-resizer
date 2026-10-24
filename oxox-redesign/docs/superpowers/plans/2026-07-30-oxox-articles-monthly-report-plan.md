# OXOX Articles and Monthly Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Astro Content Collections-powered article center, publish the confirmed 2026 January–June and January–May Yueqing foreign-trade reports, and surface the newest report on the homepage without displacing company search.

**Architecture:** Store each report as a Markdown entry in an `articles` content collection, validate its metadata at build time, and generate static article routes through one shared editorial layout. The article center and homepage query the same collection so titles, dates, excerpts, categories, and links have one source of truth.

**Tech Stack:** Astro 7 Content Collections, Markdown, Astro components, CSS, Node test runner, Playwright CLI, GitHub Pages.

## Global Constraints

- Preserve the current OXOX paper, ink-green, orange, yellow, serif/sans visual system and shared animated wordmark.
- Keep company search as the homepage's primary visual action; articles are secondary.
- Publish exactly two initial articles in category `monthly-report`, displayed as “月报”.
- Do not display author, source, publisher, or “整理” attribution.
- The January–June country table must say `2026 年 1—6 月` and use `1—6 月出口额`.
- The January–May country table title must say `2026 年 1—5 月`, while its amount column must preserve the confirmed source label `1—4 月出口额`.
- Normalize “同比下降-2.06%” to “同比下降 2.06%”.
- Normalize the duplicated January–May import summary item to “农产品、塑料制品、铁合金”.
- Use orange for positive growth and green for negative growth.
- Preserve all supplied numeric values; do not add forecasts, causal claims, invented precision, or unprovided attribution.
- Mobile tables may scroll inside their own containers; the document itself must not overflow horizontally.
- Existing ranking and image-tool routes must continue to build and function.

---

### Task 1: Define and validate the Astro article collection

**Files:**
- Create: `src/content.config.ts`
- Create: `tests/articles.test.mjs`

**Interfaces:**
- Produces collection `articles` with entry data:
  - `title: string`
  - `description: string`
  - `category: "monthly-report"`
  - `categoryLabel: string`
  - `period: string`
  - `periodStart: Date`
  - `periodEnd: Date`
  - `publishedAt: Date`
  - `featured: boolean`
  - `draft: boolean`

- [ ] **Step 1: Write the failing collection-contract test**

Add `tests/articles.test.mjs` with a source-level contract that reads `src/content.config.ts` and asserts the `glob` loader, `articles` export, required schema fields, `monthly-report` enum, and boolean defaults exist:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("article collection validates monthly-report metadata", async () => {
  const config = await read("src/content.config.ts");
  assert.match(config, /defineCollection/);
  assert.match(config, /glob\(\{\s*pattern:\s*"\*\*\/\*\.md"/s);
  for (const field of [
    "title", "description", "category", "categoryLabel", "period",
    "periodStart", "periodEnd", "publishedAt", "featured", "draft",
  ]) assert.match(config, new RegExp(`${field}:`));
  assert.match(config, /z\.literal\("monthly-report"\)/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/articles.test.mjs`

Expected: FAIL with `ENOENT` for `src/content.config.ts`.

- [ ] **Step 3: Implement the collection schema**

Create `src/content.config.ts`:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.literal("monthly-report"),
    categoryLabel: z.string(),
    period: z.string(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    publishedAt: z.coerce.date(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { articles };
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/articles.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts tests/articles.test.mjs
git commit -m "Add Astro articles collection"
```

---

### Task 2: Add the two confirmed monthly-report entries

**Files:**
- Create: `src/content/articles/yueqing-foreign-trade-2026-h1.md`
- Create: `src/content/articles/yueqing-foreign-trade-2026-jan-may.md`
- Modify: `tests/articles.test.mjs`

**Interfaces:**
- Consumes: collection fields from Task 1.
- Produces entry IDs `yueqing-foreign-trade-2026-h1` and `yueqing-foreign-trade-2026-jan-may`.
- Each content file uses semantic HTML tables wrapped in `<div class="data-table-wrap">` so the shared layout can style and scroll them.
- Positive values use `<span class="trend trend-up">`; negative values use `<span class="trend trend-down">`.

- [ ] **Step 1: Add failing content-integrity tests**

Extend `tests/articles.test.mjs` to:

```js
test("initial monthly reports preserve confirmed periods, sections, and table counts", async () => {
  const h1 = await read("src/content/articles/yueqing-foreign-trade-2026-h1.md");
  const may = await read("src/content/articles/yueqing-foreign-trade-2026-jan-may.md");

  for (const article of [h1, may]) {
    assert.match(article, /category: monthly-report/);
    assert.match(article, /## 核心看点/);
    for (const heading of [
      "一、外贸进出口情况概况",
      "二、外贸企业情况",
      "三、出口产品情况",
      "四、出口市场情况",
      "五、外贸进口情况",
    ]) assert.ok(article.includes(heading));
    assert.doesNotMatch(article, /数据来源|整理：|作者：/);
  }

  assert.equal((h1.match(/<table/g) || []).length, 3);
  assert.equal((may.match(/<table/g) || []).length, 4);
  assert.match(h1, /2026 年 1—6 月主要出口贸易国（地区）情况表/);
  assert.match(h1, /1—6 月出口额/);
  assert.match(may, /2026 年 1—5 月主要出口贸易国（地区）情况表/);
  assert.match(may, /1—4 月出口额/);
  assert.match(may, /同比下降 2\.06%/);
  assert.match(may, /农产品、塑料制品、铁合金/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/articles.test.mjs`

Expected: FAIL because both Markdown files are absent.

- [ ] **Step 3: Create the January–June entry**

Use this exact frontmatter:

```yaml
---
title: 乐清市 2026 年 1—6 月外贸情况分析
description: 2026 年 1—6 月乐清外贸进出口、企业结构、出口产品、主要市场和进口情况的数据解读。
category: monthly-report
categoryLabel: 月报
period: 2026 年 1—6 月
periodStart: 2026-01-01
periodEnd: 2026-06-30
publishedAt: 2026-07-30
featured: true
draft: false
---
```

The article body must include:

- A `## 核心看点` section with exactly four supported observations:
  1. Total trade `180.9 亿元`, `+14.6%`; exports `175.9 亿元`, `+14.0%`; imports `4.9 亿元`, `+39.10%`.
  2. Electrical products `110.94 亿元`, `+15.88%`.
  3. Belt and Road exports `122.66 亿元`, `+14.4%`, share `67.8%`; RCEP `40.82 亿元`, `+22.6%`.
  4. Enterprises over USD 10 million grew `10.88%`; small/micro enterprises declined `23.84%`.
- All five supplied report chapters, with page markers `2` and `3`, broken PDF lines, duplicated punctuation, and “；” before list numbering removed.
- Product table rows in the supplied order from 电气控制装置 through 电动机及发电机（组）.
- Trade-region table rows from 亚洲 through RCEP 国家, preserving 东盟、中东、欧盟 subrows.
- Country table rows from 美国 through 德国, and the confirmed `1—6 月出口额` column label.
- Values with negative growth (`电子元件 -1.6`, `灯具 -36.3`, `俄罗斯 -2.0`, `菲律宾 -6.6`, `墨西哥 -9.7`) marked `trend-down`; all positive growth values marked `trend-up`.

- [ ] **Step 4: Create the January–May entry**

Use this exact frontmatter:

```yaml
---
title: 乐清市 2026 年 1—5 月外贸情况分析
description: 2026 年 1—5 月乐清外贸进出口、企业数量、出口商品、市场分布和进口商品的数据解读。
category: monthly-report
categoryLabel: 月报
period: 2026 年 1—5 月
periodStart: 2026-01-01
periodEnd: 2026-05-31
publishedAt: 2026-07-30
featured: false
draft: false
---
```

The article body must include:

- A `## 核心看点` section covering total trade `145.5 亿元`, exports `141.11 亿元`, imports `4.29 亿元`, electrical exports `88.86 亿元`, Belt and Road exports `98.18 亿元`, and `2,789` exporting enterprises with `205` new exporters.
- All five supplied chapters, with page markers `2`, `3`, `4`, broken PDF lines, and duplicated punctuation removed.
- Normalize “同比下降-2.06%” to “同比下降 2.06%”.
- Normalize the import summary to “橡胶制品是主要进口商品，其次是农产品、塑料制品、铁合金等。”
- Product table rows from 电气控制装置 through 蓄电池.
- Trade-region table rows from 亚洲 through RCEP 国家, preserving 东盟、欧盟 subrows.
- Country table rows from 美国 through 沙特阿拉伯. The table caption must be `2026 年 1—5 月主要出口贸易国（地区）情况表`, but the amount header must remain `1—4 月出口额（万元）`.
- Import table rows from 橡胶及其制品 through 通用机械设备.
- Negative growth values must use `trend-down`, including 外商投资企业 `-2.06`, 电子元件 `-6.0`, 灯具 `-33.7`, 紧固件 `-8.59`, 拉丁美洲 `-0.6`, 巴西 `-4.9`, 墨西哥 `-10.6`, 塑料进口 `-17.8`, 铁合金 `-56.9`, 电气控制装置进口 `-4.4`, 机床 `-54.4`, 铜材 `-13.9`, and通用机械设备 `-54.5`.

Use the following narrative fact checklist so no supplied paragraph is dropped:

```text
1—6 月企业：1000 万美元以上 82.03 亿元/+10.88%；500—1000 万美元 25.95 亿元/+4.69%；300—500 万美元 17.21 亿元/+8.52%；300 万美元以下 48.85 亿元/-23.84%。
1—6 月企业类型：自营生产型 127.68 亿元/+16.07%；外贸流通 41.21 亿元/+9.25%；外商投资 6.71 亿元/+5.01%。
1—6 月产品：电气产品 110.94 亿元/+15.88%；其他产品包括贱金属及其制品、塑料制品、计量检测分析自控仪器及器具、汽摩配、通用机械设备、纺织服装。
1—6 月市场：“一带一路”122.66 亿元/+14.4%；RCEP 40.82 亿元/+22.6%；出口覆盖 203 个国家（地区），美国最大，其次为俄罗斯、泰国、印度。
1—6 月进口：有进口业绩企业 521 家；千万美元以上 1 家；300—1000 万美元 6 家；100—300 万美元 4 家；前十企业占进口 84.97%；主要商品为橡胶制品、农产品、塑料制品、铁合金。

1—5 月企业：1000 万美元以上 67.01 亿元/+11.19%；500—1000 万美元 20.5 亿元/+0.25%；300—500 万美元 13.49 亿元/+2.61%；300 万美元以下 38.95 亿元/-19.73%。
1—5 月企业数量：有出口实绩企业 2789 家；新增 205 家，新增企业累计出口 1.15 亿元。
1—5 月企业类型：自营生产型 102.34 亿元/+13.64%；外贸流通 33.23 亿元/+7.93%；外商投资 5.32 亿元/-2.06%。
1—5 月产品：电气产品 88.86 亿元/+13.88%，占比约 62.97%；其他产品分类与 1—6 月报告相同。
1—5 月市场：“一带一路”98.18 亿元/+11.8%，占 69.6%；RCEP 32.48 亿元/+17.0%；出口覆盖 205 个国家（地区）；台湾地区 1.74 亿元/+35.92%。
1—5 月进口：有进口业绩企业 463 家；千万美元以上 1 家；300—1000 万美元 5 家；100—300 万美元 5 家；主要商品为橡胶制品、农产品、塑料制品、铁合金。
```

Use these exact table datasets, keeping the listed order:

```text
H1_PRODUCTS
电气控制装置|869822|15.22|48.1
贱金属及其制品|185525|17.9|10.3
塑料及其制品|83051|8.0|4.6
计量检测分析自控仪器及器具|53832|33.3|3.0
仪表仪器|50535|37.8|2.8
变压器|50371|15.0|2.8
电线及电缆|41617|7.5|2.3
汽摩配|33467|38.3|1.9
纺织服装|32084|5.3|1.8
音视频设备及其零件|29411|11.2|1.6
电子元件|28529|-1.6|1.6
灯具、照明装置及其零件|17725|-36.3|1.0
泵|16166|26.5|0.9
阀门及类似装置|13506|15.0|0.7
家具及其零件|13052|10.0|0.7
电动机及发电机（组）|13005|19.7|0.7

H1_REGIONS
亚洲|750946|18.6|41.5
其中：东盟|330882|22.8|18.3
其中：中东|167811|2.4|9.3
欧洲|438159|8.8|24.2
其中：欧盟|244175|11.9|13.5
拉丁美洲|222196|5.5|12.3
北美|182762|22.3|10.1
非洲|140396|14.3|7.8
大洋洲|33882|13.2|1.9
一带一路|1226614|14.4|67.8
RCEP 国家|408186|22.6|22.6

H1_COUNTRIES
美国|152257|19.1|8.4
俄罗斯|122645|-2.0|6.8
泰国|100028|17.0|5.5
印度|86068|25.8|4.8
越南|83697|45.9|4.6
巴西|77917|3.7|4.3
土耳其|56488|22.9|3.1
菲律宾|44906|-6.6|2.5
墨西哥|44829|-9.7|2.5
德国|43638|29.1|2.4

JAN_MAY_PRODUCTS
电气控制装置|701287|13.71|49.7
贱金属及其制品|150049|17.3|10.6
塑料及其制品|65625|0.5|4.7
静止式变流器|43022|13.4|3.0
计量检测分析自控仪器及器具|43018|29.0|3.0
仪表仪器|40379|33.9|2.9
变压器|37742|8.6|2.7
电线及电缆|33921|9.3|2.4
汽摩配|26052|24.4|1.8
纺织服装|25680|8.0|1.8
音视频设备及其零件|23834|7.6|1.7
电子元件|22954|-6.0|1.6
灯具、照明装置及其零件|13505|-33.7|1.0
泵|12889|22.0|0.9
阀门及类似装置|10875|6.5|0.8
家具及其零件|10861|12.1|0.8
电动机及发电机（组）|9779|5.3|0.7
橡胶及其制品|8854|31.7|0.6
紧固件|7496.27|-8.59|0.5
蓄电池|6158.45|133.89|1.5

JAN_MAY_REGIONS
亚洲|605056|16.2|42.9
其中：东盟|262264|17.3|18.6
欧洲|357047|9.1|25.3
其中：欧盟|197675|12|14.0
拉丁美洲|172949|-0.6|12.3
北美|145824|19.4|10.3
非洲|109973|10.3|7.8
大洋洲|27369|7.3|1.9
一带一路|981755|11.8|69.6
RCEP 国家|324823|17.0|23.0

JAN_MAY_COUNTRIES
美国|121853|16.7|8.6
俄罗斯|102857|1.1|7.3
泰国|81189|16.8|5.8
印度|69169|21.3|4.9
越南|66475|37.8|4.7
巴西|60519|-4.9|4.3
土耳其|47127|21.0|3.3
墨西哥|36930|-10.6|2.6
德国|34876|25.8|2.5
沙特阿拉伯|33198|32.4|2.4

JAN_MAY_IMPORTS
橡胶及其制品|7426|66.1|17.3
农产品|7100|110.5|16.6
塑料及其制品|5601|-17.8|13.1
铁合金|4654|-56.9|10.9
电气控制装置|2266|-4.4|5.3
手用或机用工具|830|38.6|1.9
机床|768|-54.4|1.8
未锻造的铜及铜材|539|-13.9|1.3
钢材|300|25.3|0.7
通用机械设备|295|-54.5|0.7
```

- [ ] **Step 5: Run collection and content tests**

Run: `node --test tests/articles.test.mjs`

Expected: all article tests PASS.

- [ ] **Step 6: Run Astro schema validation**

Run: `npm run build`

Expected: Astro reports 0 errors and generates the existing four routes; article routes are added in Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/content/articles tests/articles.test.mjs
git commit -m "Add Yueqing monthly trade reports"
```

---

### Task 3: Build the shared editorial article layout

**Files:**
- Create: `src/layouts/ArticleLayout.astro`
- Modify: `tests/articles.test.mjs`

**Interfaces:**
- Consumes Astro props:
  - `entry: CollectionEntry<"articles">`
  - `related: CollectionEntry<"articles">[]`
- Receives rendered Markdown through `<slot />`.
- Produces shared header, breadcrumb, report-cover hero, metadata, article body styling, table styling, related-report links, Article JSON-LD, and BreadcrumbList JSON-LD.

- [ ] **Step 1: Add a failing layout contract test**

```js
test("article layout provides editorial UI, structured data, and responsive tables", async () => {
  const layout = await read("src/layouts/ArticleLayout.astro");
  assert.match(layout, /<Wordmark/);
  assert.match(layout, /数据解读\s*\/\s*\{entry\.data\.categoryLabel\}/);
  assert.match(layout, /application\/ld\+json/);
  assert.match(layout, /"Article"/);
  assert.match(layout, /"BreadcrumbList"/);
  assert.match(layout, /\.article-body :global\(\.data-table-wrap\)/);
  assert.match(layout, /overflow-x:\s*auto/);
  assert.match(layout, /\.trend-up[^}]*var\(--orange\)/s);
  assert.match(layout, /\.trend-down[^}]*var\(--green\)/s);
  assert.doesNotMatch(layout, /author|publisher|数据来源|整理：/i);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/articles.test.mjs`

Expected: FAIL because `ArticleLayout.astro` is absent.

- [ ] **Step 3: Implement the layout**

The layout must:

- Import `Wordmark` and `CollectionEntry`.
- Set `<title>` to `${entry.data.title}｜乐清外贸月报｜OXOX`.
- Render the description meta tag and canonical URL.
- Build Article JSON-LD using headline, description, `datePublished`, and `mainEntityOfPage`, omitting author/publisher.
- Build a BreadcrumbList for 首页 → 数据解读 → current title.
- Reuse the current OXOX header and animated wordmark styling.
- Place category, period, title, description, and report issue marker in an asymmetric cover hero.
- Render `<slot />` inside `.article-body`.
- Apply a readable Chinese measure of about `760px` for paragraphs while letting tables break out wider.
- Style `h2`, paragraphs, lists, blockquotes, figures, captions, and tables.
- Style `.trend-up` orange and `.trend-down` green.
- Make `.data-table-wrap` focusable with `tabindex="0"` in content files and visually indicate keyboard focus.
- Render `related` entries after the article as “继续阅读”.
- Include desktop, `900px`, and `640px` breakpoints plus `prefers-reduced-motion`.

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/articles.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/ArticleLayout.astro tests/articles.test.mjs
git commit -m "Add editorial article layout"
```

---

### Task 4: Generate article routes and the article center

**Files:**
- Create: `src/pages/articles/[...slug].astro`
- Create: `src/pages/articles/index.astro`
- Modify: `tests/articles.test.mjs`
- Modify: `tests/architecture.test.mjs`

**Interfaces:**
- Consumes collection `articles` and `ArticleLayout`.
- Produces static routes `/articles/yueqing-foreign-trade-2026-h1/` and `/articles/yueqing-foreign-trade-2026-jan-may/`.
- Produces `/articles/` sorted by `periodEnd` descending.

- [ ] **Step 1: Add failing route tests**

Add tests that assert:

```js
test("article routes come from the content collection", async () => {
  const route = await read("src/pages/articles/[...slug].astro");
  const index = await read("src/pages/articles/index.astro");
  assert.match(route, /getCollection\("articles"/);
  assert.match(route, /getStaticPaths/);
  assert.match(route, /render\(entry\)/);
  assert.match(route, /<ArticleLayout/);
  assert.match(index, /getCollection\("articles"/);
  assert.match(index, /periodEnd/);
  assert.match(index, /月报/);
});
```

Extend the production-route expectation in `tests/architecture.test.mjs` with:

- `dist/articles/index.html`
- `dist/articles/yueqing-foreign-trade-2026-h1/index.html`
- `dist/articles/yueqing-foreign-trade-2026-jan-may/index.html`

Assert both report titles, `核心看点`, all five section headings, and the confirmed period labels in built HTML.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/articles.test.mjs tests/architecture.test.mjs`

Expected: FAIL because the article routes do not exist.

- [ ] **Step 3: Implement the dynamic route**

Use:

```astro
---
import { getCollection, render } from "astro:content";
import ArticleLayout from "../../layouts/ArticleLayout.astro";

export async function getStaticPaths() {
  const articles = await getCollection("articles", ({ data }) => !data.draft);
  return articles.map((entry) => ({ params: { slug: entry.id }, props: { entry, articles } }));
}

const { entry, articles } = Astro.props;
const { Content } = await render(entry);
const related = articles
  .filter((item) => item.id !== entry.id)
  .sort((a, b) => b.data.periodEnd.valueOf() - a.data.periodEnd.valueOf())
  .slice(0, 2);
---

<ArticleLayout entry={entry} related={related}>
  <Content />
</ArticleLayout>
```

- [ ] **Step 4: Implement the article center**

The index must:

- Query non-draft articles.
- Sort by `periodEnd` descending rather than equal `publishedAt` dates.
- Use the shared header and wordmark animation.
- Render title “乐清外贸数据解读”, description, “月报” label, two article cards, periods, excerpts, and links.
- Feature the newest article in a larger editorial card while keeping the second in the report archive.
- Include a link back to ranking search.
- Render an explicit empty state if no published entries exist.
- Include responsive breakpoints and reduced-motion support.

- [ ] **Step 5: Run the build and focused tests**

Run: `npm run build && node --test tests/articles.test.mjs tests/architecture.test.mjs`

Expected: build succeeds and focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/articles src/layouts/ArticleLayout.astro tests/articles.test.mjs tests/architecture.test.mjs
git commit -m "Build articles index and report pages"
```

---

### Task 5: Add homepage and navigation entry points

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/yueqing-export-ranking/index.astro`
- Modify: `tests/architecture.test.mjs`

**Interfaces:**
- Homepage consumes `getCollection("articles")`, selects the newest featured non-draft entry by `periodEnd`, and links to `/articles/${entry.id}/`.
- Main navigation links “数据解读” to `/articles/`.

- [ ] **Step 1: Add failing navigation and homepage-module tests**

Extend `tests/architecture.test.mjs`:

```js
test("homepage keeps search first and surfaces the latest monthly report", async () => {
  const home = await read("src/pages/index.astro");
  const ranking = await read("src/pages/yueqing-export-ranking/index.astro");
  assert.match(home, /getCollection\("articles"/);
  assert.match(home, /LATEST REPORT \/ 最新月报/);
  assert.match(home, /乐清市 2026 年 1—6 月外贸情况分析/);
  assert.match(home, /href="\/articles\/"/);
  assert.match(ranking, /href="\/articles\/"/);
  assert.ok(home.indexOf('class="company-search"') < home.indexOf("LATEST REPORT / 最新月报"));
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/architecture.test.mjs`

Expected: FAIL because the article entry points are absent.

- [ ] **Step 3: Update the homepage**

- Import `getCollection` from `astro:content`.
- Select the featured, non-draft article with the newest `periodEnd`.
- Add “数据解读” to the main nav.
- Insert a latest-report module between ranking preview and data capabilities.
- Show `月报`, period, title, description, the report's three headline figures (`180.9 亿元`, `175.9 亿元`, `+14.0%`), and a “阅读全文” link.
- Preserve the current search-first hero and existing tool module.
- Add mobile styling without document overflow.

- [ ] **Step 4: Update the ranking-page navigation**

Replace or supplement the current “返回工具箱” action with a compact nav that includes:

- `首页`
- `数据解读`

Do not change ranking table behavior.

- [ ] **Step 5: Run focused tests and build**

Run: `npm run build && node --test tests/architecture.test.mjs tests/articles.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro src/pages/yueqing-export-ranking/index.astro tests/architecture.test.mjs
git commit -m "Surface monthly reports across OXOX"
```

---

### Task 6: Full verification, browser acceptance, push, and deployment

**Files:**
- Modify only if verification finds a defect.

**Interfaces:**
- Validates all existing and new routes without changing their contracts.

- [ ] **Step 1: Run full automated verification**

Run: `npm test`

Expected: Astro check reports 0 errors/warnings; static build includes seven routes; all Node tests pass with 0 failures.

- [ ] **Step 2: Inspect the final diff**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~5..HEAD
```

Expected: no whitespace errors; only article-system, navigation, homepage, test, spec, and plan changes.

- [ ] **Step 3: Run desktop browser acceptance**

Start: `npm run dev -- --host 127.0.0.1`

Using Playwright CLI:

- Open `/`.
- Verify company search is still the first action and latest report links to the January–June article.
- Open `/articles/`; verify two cards ordered January–June then January–May.
- Open each article and verify title, period, five chapters, table count, related link, and no author/source text.
- Confirm computed colors: `.trend-up` is `rgb(255, 92, 53)` and `.trend-down` is `rgb(11, 99, 75)`.
- Confirm browser console contains 0 errors.

- [ ] **Step 4: Run mobile browser acceptance**

Resize to `390 × 844`:

- Verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
- Verify each `.data-table-wrap` can scroll internally when its table is wider.
- Verify title, core metrics, and navigation remain readable.

- [ ] **Step 5: Push**

```bash
git push origin main
```

Expected: `main` advances to the article implementation commit.

- [ ] **Step 6: Wait for GitHub Pages**

Run:

```bash
gh run list --limit 5 --json databaseId,workflowName,status,conclusion,headSha,url
```

Copy the `databaseId` belonging to the new `Deploy Astro to GitHub Pages` run from the command output, then run `gh run watch` with that exact numeric ID and `--exit-status`.

Expected: `Deploy Astro to GitHub Pages` completes successfully with exit code 0.

- [ ] **Step 7: Verify production**

Open:

- `https://oxox.cn/articles/`
- `https://oxox.cn/articles/yueqing-foreign-trade-2026-h1/`
- `https://oxox.cn/articles/yueqing-foreign-trade-2026-jan-may/`

Verify both content and computed trend colors on production, then confirm the console has 0 errors.

# OXOX Search-First Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OXOX homepage around direct Yueqing company export-ranking search while keeping image tools as secondary utilities.

**Architecture:** Astro renders the latest ranking summary and top-three preview from the existing static JSON during the build. A native GET form sends `q` to the ranking route; the ranking page reads that parameter and applies the existing client-side filter after all period datasets load. Existing ranking and tool functionality remains isolated.

**Tech Stack:** Astro 7, static JSON, vanilla JavaScript, CSS, Node test runner, Playwright CLI, GitHub Pages.

## Global Constraints

- Preserve the existing OXOX warm off-white, ink, green, orange, and yellow visual language.
- The homepage first action is company-name or company-ID search.
- Use only confirmed static ranking data; never invent exact export values, destinations, or product categories.
- All public copy uses “出口额” and “累计排名”, never “进出口额”.
- Keep product-image-resizer and WebP converter as compact secondary links.
- Respect keyboard navigation and `prefers-reduced-motion`.
- Add no runtime dependency.

---

### Task 1: Define the homepage and query-link contract with failing tests

**Files:**
- Modify: `tests/architecture.test.mjs`
- Modify: `tests/ranking-data.test.mjs`

**Interfaces:**
- Consumes: existing Astro route files and ranking JSON.
- Produces: regression expectations for homepage content, native search form, query parsing, and current data counts.

- [ ] **Step 1: Add failing homepage structure assertions**

Add assertions to the ranking-page architecture test and the production-build expectation:

```js
const home = await read("src/pages/index.astro");
assert.match(home, /乐清出口数据/);
assert.match(home, /查询乐清企业出口排名/);
assert.match(home, /action="\/yueqing-export-ranking\/"/);
assert.match(home, /name="q"/);
assert.match(home, /3,180/);
assert.match(home, /11 个出口额区间/);
assert.match(home, /已收录 7 个周期/);
assert.match(home, /辅助工具/);
assert.doesNotMatch(home, /进出口额/);

const rankingPage = await read("src/pages/yueqing-export-ranking/index.astro");
assert.match(rankingPage, /new URLSearchParams\(location\.search\)\.get\("q"\)/);
assert.match(rankingPage, /search\.value = initialQuery/);
```

Add matching strings to `dist/index.html` and `dist/yueqing-export-ranking/index.html` expectations.

- [ ] **Step 2: Add a failing data-source consistency assertion**

```js
test("homepage summary source matches the latest ranking manifest", async () => {
  const manifest = await loadJson("public/data/yueqing-export-ranking/periods.json");
  const latest = await loadJson("public/data/yueqing-export-ranking/2026-ytd-06.json");
  assert.equal(manifest.latest, latest.period.id);
  assert.equal(latest.records.length, 3180);
  assert.equal(latest.bands.length, 11);
  assert.equal(manifest.periods.length, 7);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```bash
node --test tests/architecture.test.mjs tests/ranking-data.test.mjs
```

Expected: FAIL because the homepage is still tool-first and the ranking page does not read `q`.

- [ ] **Step 4: Commit the failing contract**

```bash
git add tests/architecture.test.mjs tests/ranking-data.test.mjs
git commit -m "Test search-first homepage contract"
```

---

### Task 2: Implement ranking-page query hydration

**Files:**
- Modify: `src/pages/yueqing-export-ranking/index.astro`
- Test: `tests/architecture.test.mjs`

**Interfaces:**
- Consumes: URL query parameter `q: string`.
- Produces: `initialQuery: string`; assigns it to `state.query` and `#rankingSearch` before the first render.

- [ ] **Step 1: Read and normalize the query parameter**

Place this after the DOM element declarations:

```js
const initialQuery = new URLSearchParams(location.search).get("q")?.trim() || "";
```

- [ ] **Step 2: Apply the query before the initial period render**

Update the successful dataset-load branch:

```js
state.datasets = new Map(datasets);
if (initialQuery) {
  search.value = initialQuery;
  state.query = initialQuery;
}
setPeriod("2026-ytd-06");
```

This preserves the current filtering, pagination, drawer, and period-switch logic.

- [ ] **Step 3: Run the focused architecture test**

Run:

```bash
npm run build
node --test tests/architecture.test.mjs
```

Expected: query-hydration assertions PASS; homepage assertions remain FAIL until Task 3.

- [ ] **Step 4: Commit query hydration**

```bash
git add src/pages/yueqing-export-ranking/index.astro tests/architecture.test.mjs
git commit -m "Support homepage company search queries"
```

---

### Task 3: Rebuild the homepage around export-data search

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/data/tools.js`
- Test: `tests/architecture.test.mjs`

**Interfaces:**
- Consumes:
  - `public/data/yueqing-export-ranking/periods.json`
  - `public/data/yueqing-export-ranking/2026-ytd-06.json`
  - `tools` from `src/data/tools.js`
- Produces:
  - GET form with `action="/yueqing-export-ranking/"` and input `name="q"`.
  - Latest data summary and `topRecords = latestRanking.records.slice(0, 3)`.
  - Compact live-tool cards.

- [ ] **Step 1: Load confirmed data at build time**

Add to the Astro frontmatter:

```astro
import periods from "../../public/data/yueqing-export-ranking/periods.json";
import latestRanking from "../../public/data/yueqing-export-ranking/2026-ytd-06.json";

const topRecords = latestRanking.records.slice(0, 3);
const liveTools = tools.filter((tool) => tool.status === "live" && tool.category !== "data");
const formatNumber = (value) => new Intl.NumberFormat("zh-CN").format(value);
```

- [ ] **Step 2: Replace metadata and header navigation**

Use:

```html
<meta name="description" content="查询乐清企业累计出口排名、出口额区间和历史名次变化，覆盖多个累计周期。">
<title>乐清出口企业排名查询｜乐清外贸出口数据｜OXOX</title>
```

Header links:

```html
<a href="/yueqing-export-ranking/">出口排名</a>
<a href="#data-capabilities">数据说明</a>
<a class="nav-cta" href="#auxiliary-tools">辅助工具</a>
```

- [ ] **Step 3: Implement the search-first hero**

The hero must contain:

```html
<p class="eyebrow">YUEQING EXPORT DATA / 乐清出口数据</p>
<h1>查询乐清企业<br><span class="accent">出口排名</span></h1>
<p>查询累计出口排名、出口额区间及历史名次变化。数据按累计周期整理，不推算未经来源确认的精确出口额。</p>
<form class="company-search" action="/yueqing-export-ranking/" method="get">
  <label class="sr-only" for="companyQuery">输入企业名称或企业编号</label>
  <input id="companyQuery" name="q" type="search" placeholder="例如：浙江正泰电器股份有限公司" required>
  <button type="submit">查询企业</button>
</form>
```

The right-side period card renders:

```astro
<strong>{latestRanking.period.label}</strong>
<span>{formatNumber(latestRanking.records.length)} 条排名记录</span>
<span>{latestRanking.bands.length} 个出口额区间</span>
<span>已收录 {periods.periods.length} 个周期</span>
```

- [ ] **Step 4: Implement ranking preview and data capabilities**

Render `topRecords` with:

```astro
{topRecords.map((record) => (
  <a class="ranking-row" href={`/yueqing-export-ranking/?q=${encodeURIComponent(record.company_name)}`}>
    <b>{String(record.rank).padStart(2, "0")}</b>
    <span>{record.company_name}<small>{record.company_id}</small></span>
    <em>{record.band_label}</em>
  </a>
))}
```

Add the capability copy:

```astro
{[
  ["01", "累计周期切换", "在已收录的累计周期之间切换，查看企业当期排名和出口额区间。"],
  ["02", "企业跨期档案", "使用稳定企业编号连接同一主体，集中查看历次排名记录。"],
  ["03", "排名变化对比", "比较较上期和去年同期名次，快速识别企业排名变化。"],
].map(([index, title, description]) => (
  <article class="capability-card">
    <small>{index}</small>
    <h3>{title}</h3>
    <p>{description}</p>
  </article>
))}
```

- [ ] **Step 5: Render utilities as secondary cards**

Use `liveTools` to show only the image resizer and WebP converter under `id="auxiliary-tools"`:

```astro
<section class="tools-section shell" id="auxiliary-tools">
  <p class="section-kicker">AUXILIARY TOOLS / 辅助工具</p>
  <h2>处理外贸日常里的重复工作</h2>
  <div class="compact-tools">
    {liveTools.map((tool, index) => (
      <a class="compact-tool" href={tool.url}>
        <small>TOOL / {String(index + 1).padStart(2, "0")}</small>
        <h3>{tool.title}</h3>
        <p>{tool.description}</p>
        <span aria-hidden="true">↗</span>
      </a>
    ))}
  </div>
</section>
```

Remove category filtering, planned cards, and the old roadmap from the homepage. Keep the tools’ existing URLs unchanged.

- [ ] **Step 6: Apply the approved A-layout CSS**

Implement the layout with these core rules, then retain the existing variables, texture, keyframes, and breakpoint details around them:

```css
.hero { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr); gap:60px; }
.company-search { display:grid; grid-template-columns:1fr auto; border:2px solid var(--green); background:white; }
.company-search input { min-height:72px; padding:0 24px; border:0; }
.company-search button { padding:0 30px; border:0; color:white; background:var(--orange); }
.period-card { padding:30px; border:1px solid var(--ink); background:var(--yellow); box-shadow:12px 12px 0 var(--green); }
.ranking-row { display:grid; grid-template-columns:70px 1fr auto; align-items:center; border-top:1px solid var(--line); }
.ranking-row:hover { color:white; background:var(--green); }
.compact-tools { display:grid; grid-template-columns:repeat(2,1fr); gap:18px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@media (max-width: 760px) {
  .hero { grid-template-columns:1fr; }
  .company-search { grid-template-columns:1fr; }
  .company-search button { min-height:54px; }
  .period-card { order:2; }
  .ranking-row { grid-template-columns:48px 1fr; }
  .ranking-row em { grid-column:2; }
  .compact-tools { grid-template-columns:1fr; }
}
```

Retain the existing `prefers-reduced-motion` rule and OXOX dot-orbit hover animations.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm run build
node --test tests/architecture.test.mjs tests/ranking-data.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit the homepage**

```bash
git add src/pages/index.astro src/data/tools.js tests/architecture.test.mjs tests/ranking-data.test.mjs
git commit -m "Make Yueqing export search the homepage focus"
```

---

### Task 4: Full verification, deployment, and production check

**Files:**
- Verify only; no intended source changes.

**Interfaces:**
- Consumes: built static site and GitHub Pages workflow.
- Produces: verified desktop/mobile/search behavior and production deployment.

- [ ] **Step 1: Run the complete test suite and diff checks**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected: all tests PASS, no whitespace errors, clean worktree after commits.

- [ ] **Step 2: Verify desktop behavior in a real browser**

Start Astro and use Playwright to assert:

- homepage title and H1;
- visible `name="q"` search input;
- visible counts `3,180`, `11`, and `7`;
- top-three preview uses the JSON’s first three companies;
- form submission with `浙江正泰电器股份有限公司`;
- ranking page URL contains `q=...`;
- result summary shows the matching company.

- [ ] **Step 3: Verify mobile layout**

At `390 × 844`, confirm no horizontal overflow and that search precedes the period card. Check keyboard focus styles and zero browser-console errors.

- [ ] **Step 4: Push and monitor Pages**

Run:

```bash
git push origin main
run_id=$(gh run list --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --exit-status
```

Expected: build and deploy jobs complete successfully.

- [ ] **Step 5: Verify production**

Open:

```text
https://oxox.cn/
```

Submit a company search and confirm production lands on:

```text
https://oxox.cn/yueqing-export-ranking/?q=浙江正泰电器股份有限公司
```

Verify the filtered record, responsive layout, counts, and browser console.

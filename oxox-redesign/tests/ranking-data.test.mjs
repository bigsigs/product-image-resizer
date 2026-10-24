import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const loadJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

test("homepage summary source matches the latest ranking manifest", async () => {
  const manifest = await loadJson("public/data/yueqing-export-ranking/periods.json");
  const latest = await loadJson("public/data/yueqing-export-ranking/2026-ytd-08.json");
  assert.equal(manifest.latest, latest.period.id);
  assert.equal(latest.records.length, 3373);
  assert.equal(latest.bands.length, 14);
  assert.equal(manifest.periods.length, 12);
});

test("2026 Jan-Aug cumulative export ranking preserves every supplied row and rank gap", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-08.json");

  assert.deepEqual(data.period, {
    id: "2026-ytd-08",
    label: "2026年1—8月",
    type: "year_to_date",
    as_of: "2026-08-31",
    metric: "exports",
  });
  assert.equal(data.records.length, 3373);
  assert.equal(data.records[0].rank, 1);
  assert.equal(data.records.at(-1).rank, 3374);
  assert.equal(data.records.some((record) => record.rank === 43), false);
  assert.deepEqual(data.validation.source_rank_gaps, [43]);
  assert.deepEqual(
    data.bands.map(({ label, count }) => [label, count]),
    [
      ["1200-20000万美元", 42],
      ["650-1200万美元", 50],
      ["450-650万美元", 49],
      ["350-450万美元", 49],
      ["280-350万美元", 49],
      ["230-280万美元", 48],
      ["190-230万美元", 49],
      ["165-190万美元", 49],
      ["150-165万美元", 49],
      ["130-150万美元", 49],
      ["115-130万美元", 49],
      ["110-115万美元", 49],
      ["100-115万美元", 2],
      ["100万美元以下", 2790],
    ],
  );
  assert.equal(data.records[0].company_name, "浙江正泰电器股份有限公司");
  assert.equal(data.records.find((record) => record.rank === 42).company_name, "温州富卫德商贸有限公司");
  assert.equal(data.records.find((record) => record.rank === 44).company_name, "浙江天正电气股份有限公司");
  assert.equal(data.records.at(-1).company_name, "乐清临保供应链管理有限公司");
  assert.deepEqual(
    data.validation.duplicate_company_ids,
    ["YQ000091", "YQ000104", "YQ000150", "YQ001701", "YQ002851"],
  );
  assert.equal(data.records.filter((record) => record.source_duplicate).length, 10);
});

test("January-to-August rank comparisons use the July rankings without inventing rank 43", async () => {
  const july = await loadJson("public/data/yueqing-export-ranking/2026-ytd-07.json");
  const august = await loadJson("public/data/yueqing-export-ranking/2026-ytd-08.json");
  const julyById = new Map(july.records.map((record) => [record.company_id, record]));
  const augustById = new Map(august.records.map((record) => [record.company_id, record]));

  assert.equal(julyById.get("YQ000041").rank, 40);
  assert.equal(augustById.get("YQ000041").rank, 38);
  assert.equal(julyById.get("YQ000038").rank, 43);
  assert.equal(augustById.get("YQ000038").rank, 40);
  assert.equal(august.records.some((record) => record.rank === 43), false);
});

test("2026 Jan-Jul cumulative export ranking preserves all supplied rows and bands", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-07.json");

  assert.deepEqual(data.period, {
    id: "2026-ytd-07",
    label: "2026年1—7月",
    type: "year_to_date",
    as_of: "2026-07-31",
    metric: "exports",
  });
  assert.equal(data.records.length, 3291);
  assert.deepEqual(data.records.map((record) => record.rank), Array.from({ length: 3291 }, (_, index) => index + 1));
  assert.deepEqual(data.bands.map(({ label, count }) => [label, count]), [
    ["1000-18000万美元", 43],
    ["540-1000万美元", 50],
    ["400-540万美元", 49],
    ["300-400万美元", 49],
    ["240-300万美元", 49],
    ["200-240万美元", 49],
    ["170-200万美元", 49],
    ["150-170万美元", 49],
    ["125-150万美元", 49],
    ["110-125万美元", 49],
    ["100-110万美元", 43],
    ["100万美元以下", 2763],
  ]);
  assert.equal(data.records[0].company_name, "浙江正泰电器股份有限公司");
  assert.equal(data.records[42].band_label, "1000-18000万美元");
  assert.equal(data.records[43].band_label, "540-1000万美元");
  assert.equal(data.records.at(-1).company_name, "乐清临保供应链管理有限公司");
  assert.equal(data.records.filter((record) => record.source_duplicate).length, 12);
});

test("2026 Jan-Jun exact export ranking preserves precise values and the source rank gap", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-06-exact.json");
  assert.deepEqual(data.period, {
    id: "2026-ytd-06-exact",
    label: "2026年1—6月（精准数值）",
    type: "year_to_date",
    as_of: "2026-06-30",
    metric: "exports",
    precision: "exact",
    unit: "万美元",
  });
  assert.equal(data.records.length, 3290);
  assert.deepEqual(data.validation.source_rank_gaps, [16]);
  assert.equal(data.records.find((item) => item.rank === 1).amount_usd_10k, 17993.38);
  assert.equal(data.records.find((item) => item.rank === 8).amount_usd_10k, 3277.37);
  assert.equal(data.records.find((item) => item.rank === 3291).amount_usd_10k, 0);
  assert.equal(data.records.find((item) => item.rank === 1).amount_label, "（17,993.38 万美元）");
  assert.equal(data.records.some((item) => item.rank === 16), false);
  assert.equal(new Set(data.records.map((item) => item.company_id)).size, 3286);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 8);
});

test("2026 Jan-Jun cumulative ranking keeps every source row", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-06.json");
  assert.equal(data.period.id, "2026-ytd-06");
  assert.equal(data.period.label, "2026年1—6月");
  assert.equal(data.period.type, "year_to_date");
  assert.equal(data.records.length, 3180);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 3180 }, (_, index) => index + 1),
  );
  assert.equal(data.bands.length, 11);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 4);
});

test("company registry uses stable IDs and records source-name conflicts", async () => {
  const companies = await loadJson("public/data/yueqing-export-ranking/companies.json");
  assert.equal(companies.length, 3814);
  assert.equal(companies[0].company_id, "YQ000001");
  assert.equal(companies[0].company_name, "浙江正泰电器股份有限公司");
  assert.equal(new Set(companies.map((item) => item.company_id)).size, companies.length);
  assert.equal(companies.filter((item) => item.needs_review).length, 92);
});

test("period manifest exposes the latest period and confirmed history", async () => {
  const manifest = await loadJson("public/data/yueqing-export-ranking/periods.json");
  assert.equal(manifest.latest, "2026-ytd-08");
  assert.deepEqual(
    manifest.periods.map((period) => period.id),
    ["2026-ytd-08", "2026-ytd-07", "2026-ytd-06-exact", "2026-ytd-06", "2026-ytd-05", "2026-ytd-04", "2026-ytd-03", "2026-ytd-02", "2025-ytd-12", "2025-ytd-11", "2025-ytd-10", "2025-ytd-06"],
  );
});

test("2026 Jan-May cumulative ranking combines all 3067 supplied rows", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-05.json");
  assert.equal(data.period.id, "2026-ytd-05");
  assert.equal(data.period.label, "2026年1—5月");
  assert.equal(data.period.type, "year_to_date");
  assert.equal(data.records.length, 3067);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 3067 }, (_, index) => index + 1),
  );
  assert.equal(data.bands.length, 9);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 4);
});

test("cross-period aliases reuse stable company IDs without forced fuzzy matches", async () => {
  const companies = await loadJson("public/data/yueqing-export-ranking/companies.json");
  const previous = await loadJson("public/data/yueqing-export-ranking/2026-ytd-05.json");
  const current = await loadJson("public/data/yueqing-export-ranking/2026-ytd-06.json");
  const byName = new Map(companies.map((company) => [company.company_name, company]));
  const priorChint = previous.records.find((record) => record.company_name === "浙江正泰电器股份有限公司");
  const currentChint = current.records.find((record) => record.company_name === "浙江正泰电器股份有限公司");

  assert.equal(companies.length, 3814);
  assert.equal(priorChint.company_id, currentChint.company_id);
  assert.ok(byName.get("浙江恒裕智能家具有限公司").aliases.includes("浙江恒裕智能家居有限公司"));
  assert.ok(byName.has("温州上陶进出口有限公司"));
});

test("one period never collapses two different source names into one company ID", async () => {
  for (const file of ["2025-ytd-06.json", "2025-ytd-10.json", "2025-ytd-11.json", "2025-ytd-12.json", "2026-ytd-02.json", "2026-ytd-03.json", "2026-ytd-04.json", "2026-ytd-05.json", "2026-ytd-06.json", "2026-ytd-06-exact.json", "2026-ytd-07.json", "2026-ytd-08.json"]) {
    const data = await loadJson(`public/data/yueqing-export-ranking/${file}`);
    const namesById = new Map();
    data.records.forEach((record) => {
      const names = namesById.get(record.company_id) || new Set();
      names.add(record.company_name);
      namesById.set(record.company_id, names);
    });
    const collisions = [...namesById.entries()].filter(([, names]) => names.size > 1);
    assert.deepEqual(collisions, [], `${file} contains an unsafe company merge`);
  }
});

test("2025 Jan-Oct cumulative export ranking applies all confirmed rank bands", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2025-ytd-10.json");
  assert.deepEqual(data.period, {
    id: "2025-ytd-10",
    label: "2025年1—10月",
    type: "year_to_date",
    as_of: "2025-10-31",
    metric: "exports",
  });
  assert.equal(data.records.length, 2842);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2842 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    data.bands.map(({ label, count }) => ({ label, count })),
    [
      { label: "1000-22000万美元", count: 60 },
      { label: "950-1000万美元", count: 5 },
      { label: "560-950万美元", count: 66 },
      { label: "390-560万美元", count: 68 },
      { label: "290-390万美元", count: 63 },
      { label: "210-290万美元", count: 69 },
      { label: "170-220万美元", count: 69 },
      { label: "140-180万美元", count: 69 },
      { label: "110-150万美元", count: 69 },
      { label: "100-120万美元", count: 70 },
      { label: "100万美元以下", count: 2234 },
    ],
  );
  assert.equal(data.records[0].company_name, "乐清意华新能源科技有限公司");
  assert.equal(data.records[1].company_name, "浙江正泰电器股份有限公司");
  assert.equal(data.records.at(-1).company_name, "伊发控股集团有限公司");
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 4);
  assert.match(data.source_note, /累计排名与出口额区间/);
  assert.doesNotMatch(data.source_note, /进出口额/);
});

test("2025 Jan-Nov cumulative export ranking applies all confirmed rank bands", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2025-ytd-11.json");
  assert.deepEqual(data.period, {
    id: "2025-ytd-11",
    label: "2025年1—11月",
    type: "year_to_date",
    as_of: "2025-11-30",
    metric: "exports",
  });
  assert.equal(data.records.length, 3145);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 3145 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    data.bands.map(({ label, count }) => ({ label, count })),
    [
      { label: "1000-25000万美元", count: 68 },
      { label: "600-1000万美元", count: 67 },
      { label: "410-600万美元", count: 66 },
      { label: "310-410万美元", count: 66 },
      { label: "240-310万美元", count: 67 },
      { label: "200-240万美元", count: 63 },
      { label: "160-200万美元", count: 67 },
      { label: "130-160万美元", count: 70 },
      { label: "100-130万美元", count: 68 },
      { label: "100-110万美元", count: 47 },
      { label: "100万美元以下", count: 2496 },
    ],
  );
  assert.equal(data.records[0].company_name, "乐清意华新能源科技有限公司");
  assert.equal(data.records[1].company_name, "浙江正泰电器股份有限公司");
  assert.equal(data.records.at(-1).company_name, "浙江裕诚电气有限公司");
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 20);
  assert.match(data.source_note, /累计排名与出口额区间/);
  assert.doesNotMatch(data.source_note, /进出口额/);
});

test("2026 Jan-Apr cumulative ranking joins both supplied text segments", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-04.json");
  assert.equal(data.period.id, "2026-ytd-04");
  assert.equal(data.period.label, "2026年1—4月");
  assert.equal(data.period.type, "year_to_date");
  assert.equal(data.records.length, 2951);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2951 }, (_, index) => index + 1),
  );
  assert.equal(data.bands.length, 7);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 2);
  assert.equal(data.records.at(-1).company_name, "中天钻头有限公司");
});

test("April aliases reuse IDs while uncertain names remain separate companies", async () => {
  const companies = await loadJson("public/data/yueqing-export-ranking/companies.json");
  const april = await loadJson("public/data/yueqing-export-ranking/2026-ytd-04.json");
  const may = await loadJson("public/data/yueqing-export-ranking/2026-ytd-05.json");
  const mayById = new Map(may.records.map((record) => [record.company_id, record]));
  const aliased = april.records.find((record) => record.company_name === "乐清市点火电力电子科技有限公司");
  const uncertain = april.records.find((record) => record.company_name === "浙江三思电气有限公司");

  assert.equal(companies.length, 3814);
  assert.equal(mayById.get(aliased.company_id).company_name, "乐清市点火力电子科技有限公司");
  assert.notEqual(
    uncertain.company_id,
    april.records.find((record) => record.company_name === "浙江三迪电气有限公司").company_id,
  );
});

test("2026 Jan-Mar cumulative ranking joins both supplied text segments", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-03.json");
  assert.equal(data.period.id, "2026-ytd-03");
  assert.equal(data.period.label, "2026年1—3月");
  assert.equal(data.period.type, "year_to_date");
  assert.equal(data.records.length, 2810);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2810 }, (_, index) => index + 1),
  );
  assert.equal(data.bands.length, 5);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 0);
  assert.equal(data.records.at(-1).company_name, "乐清临保供应链管理有限公司");
});

test("March aliases reuse IDs while uncertain names remain separate companies", async () => {
  const companies = await loadJson("public/data/yueqing-export-ranking/companies.json");
  const march = await loadJson("public/data/yueqing-export-ranking/2026-ytd-03.json");
  const april = await loadJson("public/data/yueqing-export-ranking/2026-ytd-04.json");
  const aprilById = new Map(april.records.map((record) => [record.company_id, record]));
  const aliased = march.records.find((record) => record.company_name === "神奇电磁集团有限公司");
  const uncertain = march.records.find((record) => record.company_name === "乐清市鑫众进出口有限公司");

  assert.equal(companies.length, 3814);
  assert.equal(aprilById.get(aliased.company_id).company_name, "神奇电碳集团有限公司");
  assert.notEqual(
    uncertain.company_id,
    march.records.find((record) => record.company_name === "乐清市奥鑫进出口有限公司").company_id,
  );
});

test("2025 Jan-Jun cumulative export ranking preserves both supplied fragments", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2025-ytd-06.json");
  assert.equal(data.period.id, "2025-ytd-06");
  assert.equal(data.period.label, "2025年1—6月");
  assert.equal(data.period.type, "year_to_date");
  assert.equal(data.period.metric, "exports");
  assert.equal(data.records.length, 2549);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2549 }, (_, index) => index + 1),
  );
  assert.equal(data.bands.length, 8);
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 0);
  assert.equal(data.records.find((item) => item.rank === 28).band_label, "区间未提供");
  assert.equal(data.records.find((item) => item.rank === 2291).company_name, "乐清市宇华模具有限公司");
  assert.equal(data.records.at(-1).company_name, "伊发控股集团有限公司");
  assert.match(data.source_note, /出口额区间/);
  assert.doesNotMatch(data.source_note, /进出口额/);
});

test("2025 clear aliases reuse IDs while uncertain names remain separate", async () => {
  const data2025 = await loadJson("public/data/yueqing-export-ranking/2025-ytd-06.json");
  const data2026 = await loadJson("public/data/yueqing-export-ranking/2026-ytd-06.json");
  const currentById = new Map(data2026.records.map((record) => [record.company_id, record]));
  const aliased = data2025.records.find((record) => record.company_name === "温州盛电子有限公司");
  const uncertain = data2025.records.find((record) => record.company_name === "浙江俊威电气有限公司");

  assert.equal(currentById.get(aliased.company_id).company_name, "温州合盛电子有限公司");
  assert.notEqual(
    uncertain.company_id,
    data2026.records.find((record) => record.company_name === "浙江恩威电气有限公司").company_id,
  );
});

test("2025 full-year cumulative export ranking applies all confirmed rank bands", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2025-ytd-12.json");
  assert.deepEqual(data.period, {
    id: "2025-ytd-12",
    label: "2025年1—12月",
    type: "year_to_date",
    as_of: "2025-12-31",
    metric: "exports",
  });
  assert.equal(data.records.length, 2992);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2992 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    data.bands.map(({ label, count }) => ({ label, count })),
    [
      { label: "1300-28000万美元", count: 56 },
      { label: "1000-1300万美元", count: 24 },
      { label: "800-1000万美元", count: 29 },
      { label: "560-800万美元", count: 62 },
      { label: "400-560万美元", count: 62 },
      { label: "300-400万美元", count: 68 },
      { label: "240-300万美元", count: 68 },
      { label: "200-240万美元", count: 60 },
      { label: "170-200万美元", count: 55 },
      { label: "140-170万美元", count: 62 },
      { label: "120-140万美元", count: 69 },
      { label: "100-120万美元", count: 59 },
      { label: "100-110万美元", count: 22 },
      { label: "100万美元以下", count: 2296 },
    ],
  );
  assert.equal(data.records.find((item) => item.rank === 56).band_label, "1300-28000万美元");
  assert.equal(data.records.find((item) => item.rank === 57).band_label, "1000-1300万美元");
  assert.equal(data.records.find((item) => item.rank === 80).band_label, "1000-1300万美元");
  assert.equal(data.records.find((item) => item.rank === 81).band_label, "800-1000万美元");
  assert.equal(data.records.find((item) => item.rank === 696).band_label, "100-110万美元");
  assert.equal(data.records.find((item) => item.rank === 697).band_label, "100万美元以下");
  assert.equal(data.records.at(-1).company_name, "温州市乐淳电子科技有限公司");
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 6);
  assert.match(data.source_note, /累计排名与出口额区间/);
  assert.doesNotMatch(data.source_note, /进出口额/);
});

test("2025 full-year clear OCR aliases reuse stable IDs", async () => {
  const fullYear = await loadJson("public/data/yueqing-export-ranking/2025-ytd-12.json");
  const firstHalf = await loadJson("public/data/yueqing-export-ranking/2025-ytd-06.json");
  const firstHalfById = new Map(firstHalf.records.map((record) => [record.company_id, record]));
  const aliases = [
    ["亚兰电气(浙江)有限公司", "亚杜兰电气（浙江）有限公司"],
    ["乐清市凯发电制造有限公司", "乐清市凯发电气制造有限公司"],
    ["浙江立电表仪器有限公司", "浙江登立电表仪器有限公司"],
  ];

  for (const [source, expected] of aliases) {
    const record = fullYear.records.find((item) => item.company_name === source);
    assert.equal(firstHalfById.get(record.company_id).company_name, expected);
  }
});

test("2026 Jan-Feb cumulative export ranking applies the confirmed rank bands", async () => {
  const data = await loadJson("public/data/yueqing-export-ranking/2026-ytd-02.json");
  assert.deepEqual(data.period, {
    id: "2026-ytd-02",
    label: "2026年1—2月",
    type: "year_to_date",
    as_of: "2026-02-28",
    metric: "exports",
  });
  assert.equal(data.records.length, 2664);
  assert.deepEqual(
    data.records.map((item) => item.rank),
    Array.from({ length: 2664 }, (_, index) => index + 1),
  );
  assert.deepEqual(
    data.bands.map(({ label, count }) => ({ label, count })),
    [
      { label: "270-5500万美元", count: 52 },
      { label: "160-270万美元", count: 55 },
      { label: "100-160万美元", count: 55 },
      { label: "100万美元以下", count: 2502 },
    ],
  );
  assert.equal(data.records.find((item) => item.rank === 52).band_label, "270-5500万美元");
  assert.equal(data.records.find((item) => item.rank === 53).band_label, "160-270万美元");
  assert.equal(data.records.find((item) => item.rank === 107).band_label, "160-270万美元");
  assert.equal(data.records.find((item) => item.rank === 108).band_label, "100-160万美元");
  assert.equal(data.records.find((item) => item.rank === 162).band_label, "100-160万美元");
  assert.equal(data.records.find((item) => item.rank === 163).band_label, "100万美元以下");
  assert.equal(data.records.at(-1).company_name, "乐清临保供应链管理有限公司");
  assert.equal(data.records.filter((item) => item.source_duplicate).length, 0);
  assert.match(data.source_note, /累计排名与出口额区间/);
  assert.doesNotMatch(data.source_note, /进出口额/);
});

test("February clear aliases reuse March IDs while uncertain names stay separate", async () => {
  const february = await loadJson("public/data/yueqing-export-ranking/2026-ytd-02.json");
  const march = await loadJson("public/data/yueqing-export-ranking/2026-ytd-03.json");
  const marchById = new Map(march.records.map((record) => [record.company_id, record]));
  const aliased = february.records.find((record) => record.company_name === "乐清市南顿五金制品有限公司");
  const uncertain = february.records.find((record) => record.company_name === "浙江梧泰电气有限公司");

  assert.equal(marchById.get(aliased.company_id).company_name, "乐清市南颉五金制品有限公司");
  assert.notEqual(
    uncertain.company_id,
    march.records.find((record) => record.company_name === "浙江雷泰电气有限公司").company_id,
  );
});

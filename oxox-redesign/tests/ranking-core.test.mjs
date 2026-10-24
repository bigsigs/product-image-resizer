import assert from "node:assert/strict";
import { test } from "node:test";

import * as rankingCore from "../src/lib/ranking-core.js";

const {
  buildPeriodIndex,
  describeRankChange,
  filterRanking,
  suggestCompanies,
  paginateRanking,
  getPageWindow,
  getCompanyRecords,
} = rankingCore;

const records = [
  { rank: 1, company_id: "YQ000001", company_name: "浙江正泰电器股份有限公司", band_id: "b01" },
  { rank: 2, company_id: "YQ000002", company_name: "乐清测试有限公司", band_id: "b01" },
  { rank: 120, company_id: "YQ000003", company_name: "温州示例电气有限公司", band_id: "b02" },
  { rank: 501, company_id: "YQ000004", company_name: "浙江贸易有限公司", band_id: "b03" },
];

test("filterRanking combines company, band, and top-rank filters", () => {
  assert.deepEqual(
    filterRanking(records, { query: "正泰" }).map((item) => item.rank),
    [1],
  );
  assert.deepEqual(
    filterRanking(records, { band: "b01", top: 100 }).map((item) => item.rank),
    [1, 2],
  );
  assert.deepEqual(
    filterRanking(records, { query: "浙江", top: 500 }).map((item) => item.rank),
    [1],
  );
});

test("pinyin search matches full pinyin, spaces, initials, and Chinese homophones", () => {
  assert.equal(typeof rankingCore.buildCompanySearchIndex, "function");

  const searchIndex = rankingCore.buildCompanySearchIndex([
    {
      company_id: "YQ000001",
      company_name: "浙江正泰电器股份有限公司",
      aliases: [],
    },
    {
      company_id: "YQ000002",
      company_name: "乐清测试有限公司",
      aliases: ["乐清测式有限公司"],
    },
  ]);

  for (const query of ["zhengtai", "zheng tai", "ZHENGTAI", "zjztdq", "浙江政泰"]) {
    assert.deepEqual(
      filterRanking(records, { query, searchIndex }).map((item) => item.rank),
      [1],
      query,
    );
  }

  assert.deepEqual(
    filterRanking(records, { query: "ce shi", searchIndex }).map((item) => item.rank),
    [2],
  );
});

test("homepage suggestions use the latest records, rank order, and unique companies", () => {
  assert.equal(typeof suggestCompanies, "function");
  const latestRecords = [
    { rank: 40, company_id: "YQ000040", company_name: "乐清正泰太阳能科技有限公司" },
    { rank: 1, company_id: "YQ000001", company_name: "浙江正泰电器股份有限公司" },
    { rank: 13, company_id: "YQ000013", company_name: "浙江正泰仪器仪表有限责任公司" },
    { rank: 99, company_id: "YQ000001", company_name: "浙江正泰电器股份有限公司" },
    { rank: 120, company_id: "YQ000120", company_name: "浙江测试电气有限公司" },
  ];
  const searchIndex = rankingCore.buildCompanySearchIndex(latestRecords);

  assert.deepEqual(
    suggestCompanies(latestRecords, "zhengtai", { searchIndex, limit: 2 })
      .map(({ company_id, rank }) => ({ company_id, rank })),
    [
      { company_id: "YQ000001", rank: 1 },
      { company_id: "YQ000013", rank: 13 },
    ],
  );
  assert.deepEqual(suggestCompanies(latestRecords, "", { searchIndex }), []);
  assert.deepEqual(suggestCompanies(latestRecords, "不存在", { searchIndex }), []);
});

test("paginateRanking clamps pages and returns useful metadata", () => {
  const result = paginateRanking(Array.from({ length: 121 }, (_, index) => index + 1), 99, 50);
  assert.equal(result.page, 3);
  assert.equal(result.pageCount, 3);
  assert.equal(result.start, 101);
  assert.equal(result.end, 121);
  assert.equal(result.items.length, 21);
});

test("getPageWindow keeps pagination compact", () => {
  assert.deepEqual(getPageWindow(1, 3), [1, 2, 3]);
  assert.deepEqual(getPageWindow(6, 12), [1, "…", 4, 5, 6, 7, 8, "…", 12]);
});

test("getCompanyRecords preserves duplicate source rows for review", () => {
  const duplicated = [
    ...records,
    { rank: 99, company_id: "YQ000002", company_name: "乐清测试有限公司", band_id: "b09" },
  ];
  assert.deepEqual(
    getCompanyRecords(duplicated, "YQ000002").map((item) => item.rank),
    [2, 99],
  );
});

test("buildPeriodIndex compares current rank with the previous cumulative period", () => {
  const previous = [
    { rank: 1, company_id: "YQ000001" },
    { rank: 8, company_id: "YQ000002" },
    { rank: 12, company_id: "YQ000003" },
  ];
  const current = [
    { rank: 1, company_id: "YQ000001" },
    { rank: 5, company_id: "YQ000002" },
    { rank: 20, company_id: "YQ000003" },
    { rank: 30, company_id: "YQ000004" },
  ];

  const index = buildPeriodIndex(previous);
  assert.deepEqual(describeRankChange(current[0], index), { type: "flat", delta: 0, previousRank: 1 });
  assert.deepEqual(describeRankChange(current[1], index), { type: "up", delta: 3, previousRank: 8 });
  assert.deepEqual(describeRankChange(current[2], index), { type: "down", delta: 8, previousRank: 12 });
  assert.deepEqual(describeRankChange(current[3], index), { type: "new", delta: null, previousRank: null });
});

test("duplicate company rows are flagged for manual comparison review", () => {
  const previous = [
    { rank: 10, company_id: "YQ000001" },
    { rank: 99, company_id: "YQ000001" },
  ];
  assert.deepEqual(
    describeRankChange({ rank: 8, company_id: "YQ000001" }, buildPeriodIndex(previous)),
    { type: "review", delta: null, previousRank: null },
  );
});

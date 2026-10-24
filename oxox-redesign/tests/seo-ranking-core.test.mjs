import assert from "node:assert/strict";
import test from "node:test";

import {
  filterSeoCompanies,
  paginateSeoCompanies,
  summarizeSeoCompanies,
} from "../src/lib/seo-ranking-core.js";

const sample = [
  {
    brand: "CHINT",
    company_name: "浙江正泰电器股份有限公司",
    domain: "chintglobal.com",
    traffic: 130000,
    trafficChange: 8.11,
    keywords: 32000,
    keywordsChange: -6.49,
    backlinks: 150000,
    backlinksChange: 7.99,
    aiVisibility: 25,
    mentions: 861,
  },
  {
    brand: "DELIXI",
    company_name: "德力西电气销售有限公司",
    domain: "delixi-electric.com",
    traffic: 2760,
    trafficChange: -20.67,
    keywords: 1050,
    keywordsChange: 22.66,
    backlinks: 2740000,
    backlinksChange: 0.11,
    aiVisibility: 19,
    mentions: 177,
  },
  {
    brand: "SODD",
    company_name: "SODD",
    domain: "soddele.com",
    traffic: 82,
    trafficChange: 115.79,
    keywords: 72,
    keywordsChange: 4.35,
    backlinks: null,
    backlinksChange: null,
    aiVisibility: null,
    mentions: 0,
  },
];

test("SEO ranking searches brand, legal name, and domain", () => {
  assert.deepEqual(
    filterSeoCompanies(sample, { query: "正泰" }).map((item) => item.domain),
    ["chintglobal.com"],
  );
  assert.deepEqual(
    filterSeoCompanies(sample, { query: "delixi-electric" }).map((item) => item.domain),
    ["delixi-electric.com"],
  );
});

test("SEO ranking filters traffic direction and AI mentions", () => {
  assert.deepEqual(
    filterSeoCompanies(sample, { filter: "growing" }).map((item) => item.domain),
    ["chintglobal.com", "soddele.com"],
  );
  assert.deepEqual(
    filterSeoCompanies(sample, { filter: "declining" }).map((item) => item.domain),
    ["delixi-electric.com"],
  );
  assert.deepEqual(
    filterSeoCompanies(sample, { filter: "ai" }).map((item) => item.domain),
    ["chintglobal.com", "delixi-electric.com"],
  );
});

test("SEO ranking sorts descending and keeps unavailable values last", () => {
  assert.deepEqual(
    filterSeoCompanies(sample, { sortBy: "backlinks" }).map((item) => item.domain),
    ["delixi-electric.com", "chintglobal.com", "soddele.com"],
  );
  assert.deepEqual(
    filterSeoCompanies(sample, { sortBy: "aiVisibility" }).map((item) => item.domain),
    ["chintglobal.com", "delixi-electric.com", "soddele.com"],
  );
});

test("SEO ranking pagination clamps the requested page", () => {
  assert.deepEqual(paginateSeoCompanies(sample, 2, 2), {
    items: [sample[2]],
    page: 2,
    pageCount: 2,
    total: 3,
  });
  assert.equal(paginateSeoCompanies(sample, 99, 2).page, 2);
});

test("SEO summary totals the monitored portfolio", () => {
  assert.deepEqual(summarizeSeoCompanies(sample), {
    sites: 3,
    traffic: 132842,
    keywords: 33122,
    backlinks: 2890000,
    mentions: 1038,
  });
});

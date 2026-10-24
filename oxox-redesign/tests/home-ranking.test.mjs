import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { amountGroups, matchesAmountGroup, rankSignal } from "../src/lib/home-ranking.js";

const dataRoot = new URL("../public/data/yueqing-export-ranking/", import.meta.url);
const readDataset = async (file) => JSON.parse(await readFile(new URL(file, dataRoot), "utf8"));
const record = (rank, extra = {}) => ({ company_id: "YQ000091", rank, ...extra });
const indexOf = (...records) => new Map([["YQ000091", records]]);

test("an unflagged first record in a duplicated current period remains under review", () => {
  const first = record(90);
  const second = record(120, { source_duplicate: true });
  const signal = rankSignal(first, indexOf(first, second), indexOf(record(100)));
  assert.equal(signal.type, "review");
  assert.equal(signal.delta, null);
  assert.match(signal.label, /待核对/);
});

test("an ambiguous previous period cannot produce a numeric rank change", () => {
  const current = record(90);
  const signal = rankSignal(current, indexOf(current), indexOf(record(100), record(110)));
  assert.equal(signal.type, "review");
  assert.equal(signal.delta, null);
});

test("missing previous data is distinct from a rise or a confirmed unchanged rank", () => {
  const current = record(90);
  const missingCompany = rankSignal(current, indexOf(current), new Map(), true);
  assert.equal(missingCompany.type, "new");
  assert.equal(missingCompany.delta, null);
  assert.match(missingCompany.label, /未收录/);

  const missingPeriod = rankSignal(current, indexOf(current), new Map(), false);
  assert.equal(missingPeriod.type, "pending");
  assert.equal(missingPeriod.delta, null);

  const unchanged = rankSignal(current, indexOf(current), indexOf(record(90)), true);
  assert.equal(unchanged.type, "flat");
  assert.equal(unchanged.delta, 0);
});

test("confirmed exact zero belongs to the under group while an absent amount does not", () => {
  const zero = { company_id: "zero", rank: 1, amount_usd_10k: 0 };
  const dataset = { period: { precision: "exact" }, records: [zero], bands: [] };
  const groups = amountGroups(dataset);
  const under = groups.find((group) => group.id === "under");
  assert.ok(under, "zero is valid source data and must create a counted group");
  assert.equal(under.count, 1);
  assert.equal(matchesAmountGroup(zero, under), true);
  assert.equal(matchesAmountGroup({ amount_usd_10k: null }, under), false);
  assert.equal(matchesAmountGroup({}, under), false);
});

test("a wide source band retains its actual range when grouped", () => {
  const band = { id: "source-wide", label: "270-5500万美元", min_usd_10k: 270, max_usd_10k: 5500 };
  const dataset = {
    period: { precision: "range" },
    bands: [band],
    records: [{ company_id: "wide", rank: 1, band_id: band.id }],
  };
  const groups = amountGroups(dataset);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, band.label);
  assert.equal(groups[0].count, 1);
});

test("amount groups partition every real period without losing or double-counting records", async () => {
  const periods = await readDataset("periods.json");
  assert.ok(periods.periods.length > 0, "period metadata must expose the confirmed source periods");
  for (const period of periods.periods) {
    const dataset = await readDataset(period.file);
    const groups = amountGroups(dataset);
    assert.equal(groups.reduce((sum, group) => sum + group.count, 0), dataset.records.length, `${period.id}: grouped count must equal the source total`);
    for (const source of dataset.records) {
      const matches = groups.filter((group) => matchesAmountGroup(source, group));
      assert.equal(matches.length, 1, `${period.id}: rank ${source.rank} must belong to exactly one amount group`);
    }
    for (const group of groups) {
      assert.equal(group.count, dataset.records.filter((source) => matchesAmountGroup(source, group)).length, `${period.id}: ${group.id} must count its actual matching records`);
    }
  }
});

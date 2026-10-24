#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public/data/yueqing-export-ranking");
const reviewDir = path.join(root, "review/company-enrichment");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const ranking = readJson(path.join(dataDir, "2026-ytd-07.json")).records;
const companies = readJson(path.join(dataDir, "companies.json"));
const profiles = readJson(path.join(dataDir, "company-profiles.json"));
const checklist = readJson(path.join(reviewDir, "top500-review.json"));
const permanentlyExcludedCompanies = readJson(
  path.join(reviewDir, "permanently-excluded-companies.json"),
);

const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const validUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
const host = (value) => new URL(value).hostname.replace(/^www\./, "").toLowerCase();
const thirdPartyDomains = [
  "1688.com",
  "alibaba.com",
  "boyuan.com",
  "cnpp.cn",
  "cnverify.com",
  "huangye88.com",
  "jdzj.com",
  "maigoo.com",
  "qcc.com",
  "qichacha.com",
  "shuidi.cn",
  "shuididp.cn",
  "tendata.com",
  "ybw.cn",
  "zhaopin.com",
  "zhipin.com",
];
const isThirdParty = (value) => {
  const domain = host(value);
  return thirdPartyDomains.some((item) => domain === item || domain.endsWith(`.${item}`));
};

const top500 = ranking
  .filter((record) => Number.isInteger(record.rank) && record.rank >= 1 && record.rank <= 500)
  .sort((a, b) => a.rank - b.rank);
const ids = new Set(companies.map((company) => company.company_id));

assert(top500.length === 500, `Top 500 source has ${top500.length} rows`);
assert(checklist.length === 500, `checklist has ${checklist.length} rows`);
assert(new Set(top500.map((record) => record.rank)).size === 500, "Top 500 ranks must be unique");
assert(new Set(top500.map((record) => record.company_id)).size === 500, "Top 500 company IDs must be unique");
assert(new Set(checklist.map((row) => row.rank)).size === 500, "checklist ranks must be unique");
assert(new Set(checklist.map((row) => row.company_id)).size === 500, "checklist company IDs must be unique");

top500.forEach((record, index) => {
  const row = checklist[index];
  assert(row, `ranking #${record.rank}: missing checklist row`);
  if (!row) return;
  assert(row.rank === record.rank, `ranking #${record.rank}: checklist rank mismatch`);
  assert(row.company_id === record.company_id, `ranking #${record.rank}: checklist ID mismatch`);
  assert(row.company_name === record.company_name, `ranking #${record.rank}: checklist name mismatch`);
  assert(ids.has(row.company_id), `${row.company_id}: not in stable company registry`);
  for (const field of ["website", "alibaba_url"]) {
    if (row[field]) assert(validUrl(row[field]), `${row.company_id}: invalid ${field} ${row[field]}`);
  }
  if (row.website) {
    assert(!isThirdParty(row.website), `${row.company_id}: third-party directory used as website ${row.website}`);
    assert(!host(row.website).includes("alibaba.com"), `${row.company_id}: Alibaba URL used as website`);
  }
  if (row.alibaba_url) {
    assert(host(row.alibaba_url).endsWith("alibaba.com"), `${row.company_id}: Alibaba field is not Alibaba`);
    assert(!host(row.alibaba_url).endsWith("1688.com"), `${row.company_id}: 1688 domestic store used as Alibaba`);
  }
});

for (const company of permanentlyExcludedCompanies) {
  assert(ids.has(company.company_id), `${company.company_id}: excluded company is not in company registry`);
  assert(
    top500.some((record) =>
      record.company_id === company.company_id
      && record.company_name === company.company_name),
    `${company.company_id}: excluded company must remain in the source ranking`,
  );
  assert(
    !profiles[company.company_id],
    `${company.company_id}: permanently excluded company must not have a profile`,
  );
}

const sourceIds = new Set();
for (const file of fs.readdirSync(reviewDir)) {
  if (!/^(top100-review|top100-supplemental)\.json$/.test(file)) continue;
  for (const row of readJson(path.join(reviewDir, file))) {
    sourceIds.add(row["企业ID"] ?? row.id);
  }
}
const top500ResearchDir = path.join(reviewDir, "top500");
const canonicalResearchFiles = [
  "research-101-233.json",
  "research-234-366.json",
  "research-367-500.json",
];
for (const file of canonicalResearchFiles.filter((name) => fs.existsSync(path.join(top500ResearchDir, name)))) {
  const rows = readJson(path.join(top500ResearchDir, file));
  for (const row of rows) sourceIds.add(row.id);
}
for (const row of checklist.filter((item) => item.status !== "待检索")) {
  assert(sourceIds.has(row.company_id), `${row.company_id}: researched checklist row has no source research record`);
}

const checklistById = new Map(checklist.map((row) => [row.company_id, row]));
const expectChecklist = (id, predicate, message) => {
  const row = checklistById.get(id);
  assert(row && predicate(row), `${id}: ${message}`);
};
expectChecklist(
  "YQ000081",
  (row) => row.website === "https://kaseey.com/"
    && row.alibaba_url === "https://suppliers.alibaba.com/yueqing-kaseey-electric-co-ltd_2881268908"
    && row.address === "浙江省温州市乐清市乐清经济开发区纬十九路77-8号",
  "Kaseey website, Alibaba store and exact address must survive enrichment",
);
expectChecklist(
  "YQ000042",
  (row) => row.registered_capital.includes("502,433,125"),
  "Tengen capital must use the latest corporate disclosure",
);
expectChecklist(
  "YQ000010",
  (row) => row.registered_capital.includes("193,880,696")
    && !row.registered_capital.includes("193,880,696.00万元"),
  "Yihua capital must use the annual-report amount and reject the mislabelled unit",
);
expectChecklist(
  "YQ000018",
  (row) => !row.website,
  "Changcheng Trading must not inherit the unverified CNC group website",
);
expectChecklist("YQ000043", (row) => row.website.includes("korlen.com"), "Korlen website is missing");
expectChecklist("YQ000071", (row) => row.website.includes("chunsheng.com"), "Chunsheng website is missing");
expectChecklist("YQ000090", (row) => Boolean(row.registered_capital), "Jiaju capital is missing");
expectChecklist(
  "YQ000098",
  (row) => row.website === "https://www.wzjh.cc/"
    && row.registered_capital.includes("1580")
    && row.address.includes("永兴二路10号"),
  "Jinhong website, capital and exact address must survive enrichment",
);
expectChecklist(
  "YQ000107",
  (row) => row.address.includes("纬十九路307号A幢二楼")
    && row.registered_capital.includes("30")
    && row.main_products.includes("逆变器"),
  "Socome registered address, capital and product scope must survive enrichment",
);
expectChecklist(
  "YQ000113",
  (row) => row.registered_capital.includes("5100"),
  "Hongtai capital is missing",
);
expectChecklist(
  "YQ000133",
  (row) => row.address.includes("经七路477号")
    && row.registered_capital.includes("20266.66"),
  "Helonex exact address and capital are missing",
);
expectChecklist(
  "YQ000162",
  (row) => row.registered_capital.includes("1180"),
  "Galaxy Fuse capital is missing",
);
expectChecklist(
  "YQ000169",
  (row) => row.address.includes("象阳工业区")
    && row.registered_capital.includes("588")
    && row.main_products.includes("LED"),
  "Hongbao Lighting registered data must survive enrichment",
);
expectChecklist(
  "YQ000249",
  (row) => !row.website.includes("radin.cn"),
  "Leidun Import & Export must not inherit Radin data",
);
expectChecklist(
  "YQ000252",
  (row) => !row.website && !row.main_products,
  "Shoufa Import & Export must not inherit unrelated SUNTREE data",
);
expectChecklist(
  "YQ000516",
  (row) => !row.website.includes("cnbrdq.com")
    && row.address.includes("七里港镇金东村")
    && row.registered_capital.includes("500")
    && row.main_products.includes("配电开关控制设备"),
  "YQ000516 must retain its exact-name CNVerify record without inheriting the unrelated cnbrdq.com website",
);
expectChecklist(
  "YQ000175",
  (row) => row.company_name === "浙江邦吉电气有限公司"
    && row.website === "https://www.bjenclosure.com/"
    && row.address === "浙江省乐清市象阳镇路头石村"
    && row.registered_capital === "500万元人民币"
    && row.main_products.includes("配电箱"),
  "Bangji must retain the user-confirmed website and verified company facts",
);
expectChecklist(
  "YQ000176",
  (row) => row.company_name === "浙江博升新材料技术有限公司"
    && row.main_products === "金属易撕盖、易拉盖及罐头包装材料"
    && !row.main_products.includes("公开资料不足"),
  "Bosun products must replace the generic placeholder",
);
expectChecklist(
  "YQ000190",
  (row) => row.company_name === "博尔斯顿电气有限公司"
    && row.website === "https://www.boerstn.com/"
    && !row.registered_capital,
  "Boerstn must keep its verified links while omitting truncated capital",
);
expectChecklist(
  "YQ000205",
  (row) => row.company_name === "浙江信基电气股份有限公司"
    && row.website === "https://www.singi.com/"
    && row.address === "浙江省乐清经济开发区纬十二路148号东首"
    && row.registered_capital === "2288万元人民币"
    && row.main_products === "低压电器、智能转换开关、双电源自动转换开关、控制与保护开关电器及电气配件",
  "Singi must keep the user-specified company name, website and reviewed facts",
);
for (const id of [
  "YQ000109",
  "YQ000118",
  "YQ000127",
  "YQ000149",
  "YQ000158",
  "YQ000171",
  "YQ000183",
  "YQ000189",
  "YQ000206",
  "YQ000212",
  "YQ000237",
  "YQ000240",
  "YQ000246",
  "YQ000262",
  "YQ000291",
  "YQ000300",
  "YQ000321",
  "YQ000342",
  "YQ000366",
  "YQ000379",
  "YQ000384",
]) {
  expectChecklist(
    id,
    (row) => !row.address
      || !/^(浙江省|浙江省温州市)?乐清市[。.]?$/.test(row.address.trim())
      || /只确认到乐清市|仅到乐清市/.test(row.note),
    "generic city-only address must not be displayed",
  );
}

const seenSources = new Set();
for (const [id, profile] of Object.entries(profiles)) {
  assert(ids.has(id), `${id}: profile has no stable company identity`);
  assert(profile && typeof profile === "object" && !Array.isArray(profile), `${id}: profile must be an object`);
  assert(Array.isArray(profile.links ?? []), `${id}: links must be an array`);
  for (const link of profile.links ?? []) {
    const key = `${id}\t${link.type}\t${link.url}`;
    assert(!seenSources.has(key), `${id}: duplicate link ${link.url}`);
    seenSources.add(key);
    assert(["official_website", "official_website_alt", "alibaba_store"].includes(link.type), `${id}: unsupported link type ${link.type}`);
    assert(validUrl(link.url), `${id}: invalid stored link ${link.url}`);
    if (["official_website", "official_website_alt"].includes(link.type)) {
      assert(!isThirdParty(link.url), `${id}: third-party domain stored as official link ${link.url}`);
    }
    if (link.type === "alibaba_store") {
      assert(host(link.url).endsWith("alibaba.com"), `${id}: invalid Alibaba store ${link.url}`);
      assert(!host(link.url).endsWith("1688.com"), `${id}: domestic 1688 store in Alibaba field`);
    }
  }
  for (const field of [
    "registered_capital",
    "main_products",
    "registered_address",
    "contact_address",
    "alibaba_address",
  ]) {
    const value = profile.details?.[field];
    if (!value) continue;
    assert(typeof value === "string" && value.trim().length > 1, `${id}: empty ${field}`);
    const fieldSource = profile.details?.field_sources?.[field]?.url;
    assert(fieldSource, `${id}: ${field} has no source URL`);
    if (fieldSource) assert(validUrl(fieldSource), `${id}: ${field} has invalid source URL`);
  }
  if (profile.details?.registered_capital) {
    const value = profile.details.registered_capital;
    assert(/(?:人民币|万元|亿元|美元|港元|\d元)|未注明币种/.test(value), `${id}: capital lacks a currency/unit or explicit caveat`);
    if (!/(?:人民币|万元|亿元|美元|港元|\d元)/.test(value)) {
      assert(/未注明币种/.test(value), `${id}: capital lacks an explicit unit and caveat`);
    }
    assert(!/(?:省|市|区|县|镇|街道|路|村|号|室|楼|园区)/.test(value)
      || /(?:人民币|万元|亿元|美元|港元)/.test(value), `${id}: capital appears to be an address`);
  }
}

if (errors.length) {
  console.error(errors.slice(0, 100).join("\n"));
  console.error(`\n${errors.length} validation error(s)`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    top500: top500.length,
    profiles: Object.keys(profiles).length,
    checklist: checklist.length,
    researched: checklist.filter((row) => row.status !== "待检索").length,
    websites: checklist.filter((row) => row.website).length,
    alibaba: checklist.filter((row) => row.alibaba_url).length,
    alibabaAddresses: checklist.filter((row) => row.alibaba_address).length,
    addresses: checklist.filter((row) => row.address).length,
    capital: checklist.filter((row) => row.registered_capital).length,
    products: checklist.filter((row) => row.main_products).length,
  }, null, 2));
}

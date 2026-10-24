#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public/data/yueqing-export-ranking");
const reviewDir = path.join(root, "review/company-enrichment");
const top500Dir = path.join(reviewDir, "top500");
const checkedAt = "2026-10-24";
const staleFieldUrls = new Map([
  ["YQ000022", new Set([
    "https://www.21food.cn/hot/key1032639.html",
    "https://www.atopchem.com/",
  ])],
  ["YQ000249", new Set([
    "https://www.radin.cn/",
  ])],
  ["YQ000516", new Set([
    "https://www.cnbrdq.com/pro_ok.asp?id=74",
    "https://wenzhou.11467.com/leqing/qiligangzhen/",
  ])],
]);
const genericProductionAddressIds = new Set([
  "YQ000067",
  "YQ000095",
  "YQ000366",
  "YQ000379",
  "YQ000384",
]);

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};
const permanentlyExcludedCompanies = readJson(
  path.join(reviewDir, "permanently-excluded-companies.json"),
);
const permanentlyExcludedCompanyIds = new Set(
  permanentlyExcludedCompanies.map((company) => company.company_id),
);

const ranking = readJson(path.join(dataDir, "2026-ytd-07.json")).records;
const top500 = ranking
  .filter((record) => Number.isInteger(record.rank) && record.rank >= 1 && record.rank <= 500)
  .sort((a, b) => a.rank - b.rank);

if (top500.length !== 500) {
  throw new Error(`Expected 500 ranking records, received ${top500.length}`);
}

const top100Review = readJson(path.join(reviewDir, "top100-review.json"));
const top100Supplemental = readJson(path.join(reviewDir, "top100-supplemental.json"));
const researchFiles = [
  "research-101-233.json",
  "research-234-366.json",
  "research-367-500.json",
].filter((name) => fs.existsSync(path.join(top500Dir, name)));
const research = researchFiles.flatMap((name) => {
  const rows = readJson(path.join(top500Dir, name));
  if (!Array.isArray(rows)) throw new Error(`${name} must contain an array`);
  return rows;
});
research.push(...top100Supplemental.map((row) => ({
  ...row,
  role: "top100_supplemental",
})));
const currentMarketingSites = [
  ["YQ000018", "https://www.cncele.com/"],
];

const byId = new Map();
const mergeResearchRows = (base, incoming) => {
  const merged = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    if (!isEmpty) merged[key] = value;
  }
  return merged;
};
const overlayResearchRows = (base, incoming) => {
  const merged = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value != null) merged[key] = value;
  }
  return merged;
};
for (const row of top100Review) {
  byId.set(row["企业ID"], { source: "top100", row });
}
for (const row of research) {
  const existing = byId.get(row.id);
  if (!existing) {
    byId.set(row.id, { source: "research", row });
    continue;
  }
  if (existing.source === "research") {
    byId.set(row.id, {
      source: "research",
      row: row.role === "top100_supplemental"
        ? overlayResearchRows(existing.row, row)
        : mergeResearchRows(existing.row, row),
    });
    continue;
  }
  if (row.role === "top100_supplemental") {
    byId.set(row.id, {
      source: "top100+research",
      row: {
        ...existing.row,
        contact_address: row.contact_address || existing.row["官网联系地址"] || "",
        products: row.products || existing.row["主营产品"] || "",
        capital: row.capital || existing.row["注册资本"] || "",
        alibaba_address: row.alibaba_address || existing.row["Alibaba店铺地址"] || "",
      },
      research: row,
    });
    continue;
  }
  byId.set(row.id, {
    source: "top100+research",
    row: {
      ...row,
      ...existing.row,
      contact_address: existing.row["官网联系地址"] || row.contact_address || "",
      products: existing.row["主营产品"] || row.products || "",
      capital: existing.row["注册资本"] || row.capital || "",
      alibaba_address: existing.row["Alibaba店铺地址"] || row.alibaba_address || "",
    },
    research: existing.research
      ? row.role === "top100_supplemental"
        ? overlayResearchRows(existing.research, row)
        : mergeResearchRows(existing.research, row)
      : row,
  });
}

const validHttpUrl = (value) => {
  try {
    return value instanceof URL && ["http:", "https:"].includes(value.protocol);
  } catch {
    return false;
  }
};

const normalizeUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (!validHttpUrl(url)) return null;
    return url.href;
  } catch {
    return null;
  }
};

const urlsFrom = (value) => {
  if (Array.isArray(value)) return value.flatMap(urlsFrom);
  if (typeof value !== "string") return [];
  return value
    .split(/\s*\|\s*|\s*[；;]\s*/)
    .map(normalizeUrl)
    .filter(Boolean);
};

const sourceObjects = (value) => {
  const seen = new Set();
  return urlsFrom(value)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((url) => {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const label = /alibaba\.com$/i.test(host)
        ? "Alibaba 国际站公开资料"
        : /(gov\.cn|cninfo\.com\.cn|sse\.com\.cn|szse\.cn|neeq\.com\.cn)$/i.test(host)
          ? "监管或企业公告"
          : "企业公开资料";
      return { label, url };
    });
};

const domainOf = (url) => new URL(url).hostname.replace(/^www\./, "");
const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const isGenericAddress = (value) => {
  const text = cleanText(value);
  return !text
    || /^(浙江省|浙江省温州市|浙江省乐清市|温州市|乐清市)[。.]?$/.test(text)
    || /具体(?:门牌|地址).{0,6}(?:未|不详)/.test(text)
    || /未公开.{0,8}地址/.test(text);
};
const isSpeculativeProduct = (value) => {
  const text = cleanText(value);
  return !text
    || /(?:由公司名称|名称及行业|公司名称含|行业目录).{0,8}推断/.test(text)
    || /^(进出口贸易|电气产品|工具类|运动用品|智能装备|科技\/电商服务)[。.\s]*$/.test(text)
    || /具体(?:产品|品类).{0,8}(?:未公开|未获得)/.test(text);
};
const looksLikeAddress = (value) => {
  const text = cleanText(value);
  return /(?:省|市|区|县|镇|街道|路|村|号|室|楼|园区|工业园)/.test(text);
};
const looksLikeCapital = (value) => {
  const text = cleanText(value);
  return /(?:人民币|万元|亿元|美元|港元|\d[\d,.]+(?:万|亿)?元)/.test(text)
    && !looksLikeAddress(text);
};
const isThirdPartyWebsite = (url) => {
  const host = domainOf(url).toLowerCase();
  return [
    "1688.com",
    "alibaba.com",
    "boyuan.com",
    "jdzj.com",
    "ybw.cn",
    "huangye88.com",
    "zhaopin.com",
    "zhipin.com",
    "cnpp.cn",
    "maigoo.com",
    "shuidi.cn",
    "shuididp.cn",
    "tendata.com",
    "cnverify.com",
    "qcc.com",
    "qichacha.com",
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
};
const isAlibabaStore = (url) => {
  const host = domainOf(url).toLowerCase();
  return host === "alibaba.com"
    || host.endsWith(".alibaba.com")
    || host === "suppliers.alibaba.com";
};
const hasWebsiteIdentityConflict = (row) => /未验证|主体不同|主体不确定|主体不一致|名称不一致|名称不完全一致|待人工确认|需人工复核|主体可能|可能为同名|同名主体/.test(
  `${cleanText(row.website_source)} ${cleanText(row.website_relation)} ${cleanText(row.note)}`,
);
const isReliableResearchWebsite = (row, url) =>
  (row.confidence === "high"
    || (row.confidence === "medium" && cleanText(row.website_relation))
    || (row.confidence === "medium" && /(?:子公司|品牌关联|品牌运营|贸易主体|同名商标)/.test(
      `${cleanText(row.website_source)} ${cleanText(row.note)}`,
    )))
  && !isThirdPartyWebsite(url)
  && !isAlibabaStore(url)
  && !hasWebsiteIdentityConflict(row);

const isAcceptableResearchAddress = (row, value) => {
  if (isGenericAddress(value)) return false;
  return row.confidence === "high"
    || (row.confidence === "medium" && /浙江省|乐清市|温州/.test(cleanText(value)));
};

const isAcceptableResearchProducts = (row, value) => {
  if (isSpeculativeProduct(value)) return false;
  return row.confidence === "high"
    || (row.confidence === "medium" && !/待进一步核实|需进一步核实/.test(cleanText(value)));
};

const bestResearchSource = (row, preference = []) => {
  const sources = urlsFrom(row.sources);
  return sources.find((url) => preference.some((domain) => domainOf(url).endsWith(domain)))
    ?? sources[0]
    ?? null;
};

const top100WebsiteSources = (row) => {
  const declared = urlsFrom(row["资料来源"]);
  return declared.length ? declared : [];
};

const profiles = readJson(path.join(dataDir, "company-profiles.json"));
const companies = readJson(path.join(dataDir, "companies.json"));
const companyNames = new Map(companies.map((company) => [company.company_id, company.company_name]));

const ensureProfile = (id) => {
  profiles[id] ??= {};
  profiles[id].links ??= [];
  profiles[id].details ??= {};
  return profiles[id];
};

const addLink = (profile, type, label, rawUrl, source) => {
  const url = normalizeUrl(rawUrl);
  if (!url) return false;
  const existing = profile.links.find((link) => normalizeUrl(link.url) === url);
  if (existing) {
    if (source && !existing.source) existing.source = source;
    return false;
  }
  profile.links.push({
    type,
    label,
    url,
    domain: domainOf(url),
    source,
    added_at: checkedAt,
  });
  return true;
};

const addSources = (details, sources) => {
  details.sources ??= [];
  const existing = new Set(details.sources.map((source) => normalizeUrl(source.url)).filter(Boolean));
  for (const source of sources) {
    if (!existing.has(source.url)) {
      details.sources.push(source);
      existing.add(source.url);
    }
  }
};

const setDetails = (details, field, value, sourceUrl, sourceType = "public_source", options = {}) => {
  const text = cleanText(value);
  if (!text) {
    if (!options.clear || !details[field]) return false;
    delete details[field];
    if (details.field_sources) delete details.field_sources[field];
    return true;
  }
  if (details[field] && !options.replace) return false;
  details[field] = text;
  if (sourceUrl) {
    details.field_sources ??= {};
    details.field_sources[field] = {
      url: sourceUrl,
      checked_at: checkedAt,
      source_type: sourceType,
    };
  }
  return true;
};

// User-reviewed facts that must win over older generic or truncated values.
// Keep these overrides after every merge so rerunning enrichment is idempotent.
const verifiedProfileOverrides = new Map([
  ["YQ000175", {
    fields: {
      contact_address: {
        value: "浙江省乐清市象阳镇路头石村",
        url: "https://www.bjenclosure.com/",
        sourceType: "public_company_record",
      },
      registered_capital: {
        value: "500万元人民币",
        url: "https://www.cnverify.com/company/Zhejiang-B-J-Electrical-Co-Ltd",
        sourceType: "company_website_or_filing",
      },
      main_products: {
        value: "配电箱、壁挂箱、落地柜、不锈钢箱体、塑料箱体、高低压成套配电设备、断路器及电气配件",
        url: "https://www.bjenclosure.com/",
        sourceType: "company_website",
      },
    },
    removeSources: [
      "https://www.p-dbox.com/",
      "https://www.p-dbox.com/wap/about.asp",
    ],
  }],
  ["YQ000176", {
    fields: {
      main_products: {
        value: "金属易撕盖、易拉盖及罐头包装材料",
        url: "https://www.zjbosun.com.cn/",
        sourceType: "company_website",
      },
    },
  }],
  ["YQ000190", {
    fields: {
      registered_capital: null,
    },
  }],
  ["YQ000205", {
    fields: {
      contact_address: {
        value: "浙江省乐清经济开发区纬十二路148号东首",
        url: "https://www.singi.com/contactus/",
        sourceType: "public_company_record",
      },
      main_products: {
        value: "低压电器、智能转换开关、双电源自动转换开关、控制与保护开关电器及电气配件",
        url: "https://www.singi.com/277.html",
        sourceType: "company_website",
      },
    },
  }],
]);

const applyVerifiedProfileOverrides = (id, profile) => {
  const override = verifiedProfileOverrides.get(id);
  if (!override) return;
  profile.details ??= {};
  profile.details.field_sources ??= {};
  for (const [field, fact] of Object.entries(override.fields)) {
    if (fact === null) {
      delete profile.details[field];
      delete profile.details.field_sources[field];
      continue;
    }
    profile.details[field] = fact.value;
    profile.details.field_sources[field] = {
      url: fact.url,
      checked_at: checkedAt,
      source_type: fact.sourceType,
    };
  }
  if (override.removeSources?.length && profile.details.sources) {
    const removed = new Set(override.removeSources.map((url) => normalizeUrl(url)));
    profile.details.sources = profile.details.sources.filter(
      (source) => !removed.has(normalizeUrl(source.url)),
    );
    if (!profile.details.sources.length) delete profile.details.sources;
  }
};

const researchNotes = new Map();
const researchConfidences = new Map();
const standardRows = [];
let mergedProfiles = 0;
let websiteCount = 0;
let alibabaCount = 0;
let addressCount = 0;
let capitalCount = 0;
let productCount = 0;

for (const record of top500) {
  const isPermanentlyExcluded = permanentlyExcludedCompanyIds.has(record.company_id);
  if (isPermanentlyExcluded) delete profiles[record.company_id];
  const entry = isPermanentlyExcluded ? undefined : byId.get(record.company_id);
  const topRow = entry?.source === "top100" || entry?.source === "top100+research"
    ? entry.row
    : null;
  const researchRow = entry?.source === "research"
    ? entry.row
    : entry?.research ?? null;
  const profile = isPermanentlyExcluded
    ? { links: [], details: {} }
    : ensureProfile(record.company_id);
  const details = profile.details;
  const researchRowForMetadata = entry?.source === "research" ? entry.row : entry?.research ?? null;
  researchNotes.set(record.company_id, { previous: details.source_note });
  researchConfidences.set(record.company_id, { previous: details.confidence });
  const before = JSON.stringify(profile);
  const isSupplementalTop100 = researchRow?.role === "top100_supplemental";
  const rejectedUrls = staleFieldUrls.get(record.company_id) ?? new Set();
  if (researchRow && hasWebsiteIdentityConflict(researchRow)) {
    for (const url of urlsFrom(researchRow.website)) {
      rejectedUrls.add(url);
    }
    profile.links = profile.links.filter((link) =>
      !["official_website", "official_website_alt"].includes(link.type)
      || !rejectedUrls.has(normalizeUrl(link.url)));
  }
  for (const [field, fieldSource] of Object.entries(details.field_sources ?? {})) {
    if (rejectedUrls.has(normalizeUrl(fieldSource.url))) {
      delete details[field];
      delete details.field_sources[field];
    }
  }
  if (genericProductionAddressIds.has(record.company_id)) {
    delete details.contact_address;
    if (details.field_sources) delete details.field_sources.contact_address;
  }
  if (rejectedUrls.size) {
    if (details.sources) {
      details.sources = details.sources.filter((source) => !rejectedUrls.has(normalizeUrl(source.url)));
      if (!details.sources.length) delete details.sources;
    }
    if (record.company_id !== "YQ000249") {
      for (const key of ["source_note", "confidence", "checked_at", "legal_name"]) delete details[key];
    }
  }
  if (record.company_id === "YQ000096") {
    profile.links = profile.links.filter((link) =>
      link.type !== "alibaba_store"
      || !/wenzhou-dongtian|dongtian-import/i.test(link.url));
  }
  if (record.company_id === "YQ000252") {
    profile.links = profile.links.filter((link) =>
      !["official_website", "official_website_alt"].includes(link.type)
      || domainOf(link.url) !== "chinasuntree.com");
    delete details.main_products;
    if (details.field_sources) delete details.field_sources.main_products;
  }
  if (record.company_id === "YQ000123") {
    delete details.alibaba_address;
    if (details.field_sources) delete details.field_sources.alibaba_address;
    if (details.source_note) {
      details.source_note = "官网、地址、产品、注册资本均有企业、招聘或国际站公开资料；Alibaba 链接已核验对应本企业国际站店铺。";
    }
  }
  if (record.company_id === "YQ000430") {
    delete details.alibaba_address;
    if (details.field_sources) delete details.field_sources.alibaba_address;
  }
  for (const [id, url] of currentMarketingSites) {
    if (id !== record.company_id) continue;
    profile.links = profile.links.filter((link) =>
      !(link.type === "official_website" && link.url === url)
      && !(link.type === "alibaba_store" && /metomfg\.1688\.com/.test(link.url)));
  }
  if (record.company_id === "YQ000008") {
    details.field_sources ??= {};
    details.field_sources.registered_capital ??= {
      url: "https://www.fangdatools.com/upload/file/20250605/17491109316990263.pdf",
      checked_at: details.checked_at,
      source_type: "company_public_document",
    };
    details.field_sources.registered_address ??= {
      url: "https://www.chachazhan.com/company/01HDBYC0TGYWADV6BCNKMMEJXE",
      checked_at: details.checked_at,
      source_type: "company_registry_mirror",
    };
  }

  let website = "";
  let alibaba = "";
  let alibabaAddress = "";
  let address = "";
  let registeredAddress = "";
  let capital = "";
  let products = "";
  let note = "";
  let confidence = "";
  let sources = [];

  if ((topRow && topRow["状态"] !== "待核实") || researchRow) {
    const legacy = topRow ?? {};
    const supplementalWebsites = researchRow
      ? urlsFrom(researchRow.website).filter((url) => isReliableResearchWebsite(researchRow, url))
      : [];
    const supplementalAlibabaUrls = researchRow
      ? urlsFrom(researchRow.alibaba_url)
        .filter(isAlibabaStore)
        .filter((url) => !domainOf(url).toLowerCase().endsWith("1688.com"))
      : [];
    const websites = [
      ...urlsFrom(legacy["官网"]),
      ...supplementalWebsites,
    ].filter((url, index, all) => all.indexOf(url) === index);
    const alibabaUrls = [
      ...urlsFrom(legacy["Alibaba店铺"]),
      ...supplementalAlibabaUrls,
    ].filter((url, index, all) => all.indexOf(url) === index);
    website = websites[0] ?? "";
    alibaba = alibabaUrls[0] ?? "";
    alibabaAddress = cleanText(researchRow?.alibaba_address)
      || cleanText(legacy["Alibaba店铺地址"])
      || (researchRow && isAcceptableResearchAddress(researchRow, researchRow.alibaba_address)
        ? cleanText(researchRow.alibaba_address)
        : "");
    address = cleanText(researchRow?.contact_address)
      || cleanText(legacy["官网联系地址"])
      || (researchRow && isAcceptableResearchAddress(researchRow, researchRow.contact_address)
        ? cleanText(researchRow.contact_address)
        : "");
    registeredAddress = cleanText(legacy["注册地址（既有资料）"]);
    capital = cleanText(researchRow?.capital)
      || cleanText(legacy["注册资本"])
      || (researchRow && ["high", "medium"].includes(researchRow.confidence) && looksLikeCapital(researchRow.capital)
        ? cleanText(researchRow.capital)
        : "");
    products = cleanText(researchRow?.products)
      || cleanText(legacy["主营产品"])
      || (researchRow && isAcceptableResearchProducts(researchRow, researchRow.products)
        ? cleanText(researchRow.products)
        : "");
    note = cleanText(researchRow?.note)
      || cleanText(legacy["待核对说明"])
      || cleanText(researchRow?.note);
    confidence = cleanText(researchRow?.confidence)
      || cleanText(legacy["状态"]);
    sources = [
      ...sourceObjects(legacy["资料来源"]),
      ...sourceObjects(legacy["待核对检索来源"]),
      ...sourceObjects(researchRow?.sources),
    ].filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index);

    const websiteSource = top100WebsiteSources(legacy).find((url) => !isThirdPartyWebsite(url))
      ?? bestResearchSource(researchRow ?? {}, ["chint.com", "hefengele.com", "menred-ess.cn"])
      ?? normalizeUrl(website);
    const addressSource = bestResearchSource(researchRow ?? {}, ["gov.cn", "cninfo", "sina", "qixin"])
      ?? websiteSource
      ?? sources[0]?.url
      ?? null;
    const capitalSource = bestResearchSource(researchRow ?? {}, ["cninfo", "sina", "szse", "gov.cn"])
      ?? addressSource
      ?? sources[0]?.url
      ?? null;
    const productSource = bestResearchSource(researchRow ?? {}, ["chint.com", "hefengele.com", "menred-ess.cn", "conshion.com"])
      ?? websiteSource
      ?? sources[0]?.url
      ?? null;
    websites.forEach((url, index) => {
      addLink(
        profile,
        index === 0 ? "official_website" : "official_website_alt",
        index === 0 ? "官方网站" : "企业官网（其他域名）",
        url,
        "company_review_verified",
      );
    });
    if (alibaba) addLink(profile, "alibaba_store", "Alibaba 国际站", alibaba, "alibaba_company_profile_verified");
    const detailSource = websiteSource ?? sources[0]?.url ?? null;
    const supplementalOptions = { replace: isSupplementalTop100, clear: true };
    setDetails(details, "contact_address", address, addressSource ?? detailSource, "public_company_record", supplementalOptions);
    setDetails(details, "registered_address", registeredAddress, detailSource, "company_filing", supplementalOptions);
    setDetails(
      details,
      "alibaba_address",
      alibabaAddress,
      normalizeUrl(alibaba) ?? sources[0]?.url ?? null,
      "alibaba_company_profile",
      supplementalOptions,
    );
    setDetails(details, "registered_capital", capital, capitalSource ?? detailSource, "company_website_or_filing", supplementalOptions);
    setDetails(details, "main_products", products, productSource ?? detailSource, "company_website", supplementalOptions);
  } else if (researchRow) {
    const websiteUrls = urlsFrom(researchRow.website).filter((url) => isReliableResearchWebsite(researchRow, url));
    const supplementalOptions = { replace: isSupplementalTop100, clear: true };
    website = websiteUrls[0] ?? "";
    const alibabaUrls = urlsFrom(researchRow.alibaba_url)
      .filter(isAlibabaStore)
      .filter((url) => !domainOf(url).toLowerCase().endsWith("1688.com"));
    alibaba = alibabaUrls.find((url) => {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      if (host === "supplier.alibaba.com" && pathname.includes("/activity/")) return false;
      if (host === "www.alibaba.com" && !/(?:company_profile|showroom|supplier|store)/.test(pathname)) return false;
      return true;
    }) ?? "";
    alibabaAddress = isAcceptableResearchAddress(researchRow, researchRow.alibaba_address)
      ? cleanText(researchRow.alibaba_address)
      : "";
    address = isAcceptableResearchAddress(researchRow, researchRow.contact_address)
      ? cleanText(researchRow.contact_address)
      : "";
    capital = ["high", "medium"].includes(researchRow.confidence) && looksLikeCapital(researchRow.capital)
      ? cleanText(researchRow.capital)
      : "";
    products = isAcceptableResearchProducts(researchRow, researchRow.products)
      ? cleanText(researchRow.products)
      : "";
    note = cleanText(researchRow.note);
    confidence = cleanText(researchRow.confidence);
    sources = sourceObjects(researchRow.sources);

    websiteUrls.forEach((url, index) => {
      addLink(
        profile,
        index === 0 ? "official_website" : "official_website_alt",
        index === 0 ? "官方网站" : "企业官网（其他域名）",
        url,
        "company_review_verified",
      );
    });
    if (record.company_id === "YQ000123") {
      alibaba = "https://suppliers.alibaba.com/zhejiang-meto-electrical-coltd_17380250387";
    }
    if (alibaba && alibaba === "https://www.alibaba.com/housing-terminal-suppliers.html") alibaba = "";
    // Alibaba addresses belong in the field only when an international-store
    // link is displayed. Domestic 1688 links and their copied addresses are not
    // sufficient evidence for this section.
    if (!alibaba) alibabaAddress = "";
    if (alibaba) {
      addLink(
        profile,
        "alibaba_store",
        "Alibaba 国际站",
        alibaba,
        record.company_id === "YQ000123"
          ? "independent_search_verified"
          : "alibaba_company_profile_verified",
      );
    }
    const generalSource = bestResearchSource(researchRow)
      ?? normalizeUrl(website)
      ?? normalizeUrl(alibaba)
      ?? null;
    const addressSource = bestResearchSource(researchRow, ["gov.cn", "company", "cninfo"])
      ?? generalSource;
    setDetails(details, "contact_address", address, addressSource, "public_company_record", supplementalOptions);
    setDetails(
      details,
      "alibaba_address",
      alibabaAddress,
      normalizeUrl(researchRow.alibaba_source) ?? normalizeUrl(alibaba) ?? generalSource,
      "alibaba_company_profile",
      supplementalOptions,
    );
    setDetails(details, "registered_capital", capital, addressSource, "public_company_record", supplementalOptions);
    setDetails(details, "main_products", products, generalSource, "company_website_or_directory", supplementalOptions);
  }

  if (researchRow && note && (details.source_note === researchNotes.get(record.company_id)?.previous || isSupplementalTop100)) {
    details.source_note = note;
  }
  if (researchRow && confidence && (details.confidence === researchConfidences.get(record.company_id)?.previous || isSupplementalTop100)) {
    details.confidence = confidence;
  }
  if (sources.length) addSources(details, sources);
  applyVerifiedProfileOverrides(record.company_id, profile);
  const hasAny = !isPermanentlyExcluded
    && (Object.keys(profile.links).length > 0
    || details.sources?.length > 0
    || Object.keys(details.field_sources ?? {}).length > 0);
  if (hasAny) {
    details.checked_at ??= checkedAt;
    if (!details.legal_name && (website || alibaba || address || capital || products)) {
      details.legal_name = record.company_name;
    }
  } else {
    delete profiles[record.company_id];
  }

  if (JSON.stringify(profile) !== before) mergedProfiles++;

  const finalProfile = profiles[record.company_id] ?? { links: [], details: {} };
  const finalLinks = finalProfile.links ?? [];
  const finalDetails = finalProfile.details ?? {};
  const finalWebsite = finalLinks.find((link) =>
    ["official_website", "official_website_alt"].includes(link.type) && validHttpUrl(new URL(link.url)))?.url ?? "";
  const finalAlibaba = finalLinks.find((link) =>
    link.type === "alibaba_store" && validHttpUrl(new URL(link.url)))?.url ?? "";
  const finalAlibabaAddress = finalDetails.alibaba_address ?? "";
  const finalAddress = finalDetails.registered_address
    || finalDetails.contact_address
    || finalDetails.operating_address
    || "";
  const finalCapital = finalDetails.registered_capital ?? "";
  const finalProducts = finalDetails.main_products ?? "";
  if (finalWebsite) websiteCount++;
  if (finalAlibaba) alibabaCount++;
  if (finalAddress) addressCount++;
  if (finalCapital) capitalCount++;
  if (finalProducts) productCount++;

  const researched = Boolean(entry);
  const highConfidence = (topRow && topRow["状态"] !== "待核实")
    || researchRow?.confidence === "high";
  standardRows.push({
    rank: record.rank,
    company_id: record.company_id,
    company_name: record.company_name ?? companyNames.get(record.company_id),
    status: isPermanentlyExcluded
      ? "用户排除"
      : !researched
        ? "待检索"
        : highConfidence
          ? "已核实或高可信"
          : researchRow?.confidence === "medium"
            ? "部分字段待复核"
            : "公开资料不足",
    website: finalWebsite,
    alibaba_url: finalAlibaba,
    alibaba_address: finalAlibabaAddress,
    address: finalAddress,
    registered_capital: finalCapital,
    main_products: finalProducts,
    logo: finalProfile.details?.logo ?? "",
    checked_at: finalDetails.checked_at ?? "",
    confidence: finalDetails.confidence ?? researchRow?.confidence ?? "",
    note: finalDetails.source_note ?? note,
    source_urls: (finalDetails.sources ?? []).map((source) => source.url),
  });
}

for (const company of permanentlyExcludedCompanies) {
  if (profiles[company.company_id]) {
    throw new Error(`${company.company_id} (${company.company_name}) must remain excluded`);
  }
}

const sortedProfiles = Object.fromEntries(
  Object.entries(profiles).sort(([a], [b]) => a.localeCompare(b)),
);
writeJson(path.join(dataDir, "company-profiles.json"), sortedProfiles);

const columns = [
  ["rank", "排名"],
  ["company_id", "企业ID"],
  ["company_name", "企业名称"],
  ["status", "核对状态"],
  ["website", "官网"],
  ["alibaba_url", "Alibaba国际站"],
  ["alibaba_address", "Alibaba店铺地址"],
  ["address", "地址"],
  ["registered_capital", "注册资金"],
  ["main_products", "主营产品"],
  ["logo", "Logo"],
  ["confidence", "置信度"],
  ["checked_at", "检查日期"],
  ["note", "核对说明"],
  ["source_urls", "资料来源"],
];

writeJson(path.join(reviewDir, "top500-review.json"), standardRows);

const csvEscape = (value) => {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
};
const csv = [
  columns.map(([, label]) => csvEscape(label)).join(","),
  ...standardRows.map((row) => columns.map(([key]) => csvEscape(row[key])).join(",")),
].join("\n");
fs.writeFileSync(path.join(reviewDir, "top500-review.csv"), `${csv}\n`);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);
const logoSrc = (row) => row.logo || "";
const statusKey = (row) => {
  if (row.status === "已核实或高可信") return "verified";
  if (row.status === "部分字段待复核") return "partial";
  return "low";
};
const summary = {
  companies: standardRows.length,
  researched: standardRows.filter((row) => row.status !== "待检索").length,
  highConfidence: standardRows.filter((row) => row.status === "已核实或高可信").length,
  websites: websiteCount,
  alibaba: alibabaCount,
  addresses: addressCount,
  capital: capitalCount,
  products: productCount,
};
const tableRows = standardRows.map((row) => `<tr data-status="${statusKey(row)}">
  <td>${row.rank}</td>
  <td><code>${escapeHtml(row.company_id)}</code></td>
  <td>${escapeHtml(row.company_name)}</td>
  <td>${escapeHtml(row.status)}</td>
  <td>${row.website ? `<a href="${escapeHtml(row.website)}">${escapeHtml(domainOf(row.website))}</a>` : ""}</td>
  <td>${row.alibaba_url ? `<a href="${escapeHtml(row.alibaba_url)}">${escapeHtml(domainOf(row.alibaba_url))}</a>` : ""}</td>
  <td>${escapeHtml(row.alibaba_address)}</td>
  <td>${escapeHtml(row.address)}</td>
  <td>${escapeHtml(row.registered_capital)}</td>
  <td>${escapeHtml(row.main_products)}</td>
  <td>${row.logo ? `<img src="${escapeHtml(logoSrc(row))}" alt="" width="32" height="32" loading="lazy">` : ""}</td>
  <td>${escapeHtml(row.note)}</td>
</tr>`).join("\n");
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OXOX Top 500 企业资料核对清单</title>
  <style>
    :root{color-scheme:light;--ink:#1e2421;--muted:#66706b;--line:#dfe4e1;--paper:#f7f8f6;--panel:#fff;--accent:#255f46}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    main{max-width:1600px;margin:0 auto;padding:36px 28px 80px}h1{font-size:30px;letter-spacing:-.03em;margin:0 0 8px}.lede{color:var(--muted);margin:0 0 24px}
    .stats{display:grid;grid-template-columns:repeat(7,minmax(100px,1fr));gap:10px;margin:0 0 20px}.stat{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px}.stat b{display:block;font-size:22px}.stat span{color:var(--muted);font-size:11px}
    .tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;position:sticky;top:0;z-index:3;background:var(--paper);padding:12px 0}.tools input{width:min(440px,100%);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font:inherit;background:#fff}.tools button{border:1px solid var(--line);border-radius:8px;padding:8px 11px;background:#fff;color:var(--ink2);font:inherit;cursor:pointer}.tools button[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}.tools span{color:var(--muted)}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;background:#fff}table{width:100%;border-collapse:collapse;min-width:1500px}th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line)}th{position:sticky;top:54px;background:#f0f3f1;font-size:11px;color:var(--muted);z-index:1}td:nth-child(4){white-space:nowrap}td:nth-child(8),td:nth-child(9),td:nth-child(10){min-width:180px}a{color:var(--accent)}code{font-size:11px;color:var(--muted)}tr:hover{background:#f8faf9}td img{display:block;object-fit:contain;border:1px solid var(--line);border-radius:6px;background:#fff;padding:3px}
    @media(max-width:900px){main{padding:24px 14px}.stats{grid-template-columns:repeat(2,1fr)}h1{font-size:24px}}
  </style>
</head>
<body>
<main>
  <h1>OXOX Top 500 企业资料核对清单</h1>
  <p class="lede">2026 年 1–7 月累计出口榜前 500 名。空白表示检索后仍没有可写入的可靠证据，“候选”资料不进入生产页面。</p>
  <section class="stats">
    <div class="stat"><b>${summary.companies}</b><span>覆盖企业</span></div>
    <div class="stat"><b>${summary.researched}</b><span>已检索</span></div>
    <div class="stat"><b>${summary.highConfidence}</b><span>高可信</span></div>
    <div class="stat"><b>${summary.websites}</b><span>有效官网</span></div>
    <div class="stat"><b>${summary.alibaba}</b><span>Alibaba 国际站</span></div>
    <div class="stat"><b>${summary.addresses}</b><span>地址</span></div>
    <div class="stat"><b>${summary.products}</b><span>主营产品</span></div>
  </section>
  <div class="tools">
    <input id="filter" type="search" placeholder="搜索排名、企业、ID、地址或产品">
    <button type="button" data-filter="all" aria-pressed="true">全部</button>
    <button type="button" data-filter="verified" aria-pressed="false">高可信</button>
    <button type="button" data-filter="partial" aria-pressed="false">待复核</button>
    <button type="button" data-filter="low" aria-pressed="false">公开资料不足</button>
    <span id="count"></span>
  </div>
  <div class="table-wrap"><table><thead><tr>${columns.slice(0, 12).map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}<th>核对说明</th></tr></thead><tbody>${tableRows}</tbody></table></div>
</main>
<script>
  const filter = document.querySelector("#filter");
  const rows = [...document.querySelectorAll("tbody tr")];
  const count = document.querySelector("#count");
  const buttons = [...document.querySelectorAll("[data-filter]")];
  let activeStatus = "all";
  const update = () => {
    const query = filter.value.trim().toLowerCase();
    let visible = 0;
    for (const row of rows) {
      const statusMatches = activeStatus === "all" || row.dataset.status === activeStatus;
      const show = statusMatches && (!query || row.textContent.toLowerCase().includes(query));
      row.hidden = !show;
      if (show) visible++;
    }
    count.textContent = visible + " / " + rows.length;
  };
  filter.addEventListener("input", update);
  for (const button of buttons) {
    button.addEventListener("click", () => {
      activeStatus = button.dataset.filter;
      for (const item of buttons) item.setAttribute("aria-pressed", String(item === button));
      update();
    });
  }
  update();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(reviewDir, "top500-review.html"), html);

console.log(JSON.stringify({
  ...summary,
  researchRows: research.length,
  mergedProfiles,
}, null, 2));

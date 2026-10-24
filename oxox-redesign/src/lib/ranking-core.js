import { pinyin } from "pinyin-pro";

const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("zh-CN");
const compact = (value) => normalize(value).replace(/[^\p{Letter}\p{Number}]+/gu, "");
const containsHan = (value) => /\p{Script=Han}/u.test(String(value ?? ""));

function getPinyinTokens(value) {
  const syllables = pinyin(String(value ?? ""), {
    toneType: "none",
    type: "array",
    nonZh: "consecutive",
  }).map(compact).filter(Boolean);

  if (!syllables.length) return [];
  return [
    syllables.join(""),
    syllables.map((syllable) => syllable[0]).join(""),
  ];
}

function getSearchTokens(value, includePinyin = true) {
  const normalized = compact(value);
  const tokens = normalized ? [normalized] : [];
  if (includePinyin && containsHan(value)) tokens.push(...getPinyinTokens(value));
  return [...new Set(tokens.filter(Boolean))];
}

export function buildCompanySearchIndex(companies = []) {
  return new Map(companies.map((company) => {
    const names = [company.company_name, ...(company.aliases || [])].filter(Boolean);
    const tokens = names.flatMap((name) => getSearchTokens(name));
    return [company.company_id, [...new Set(tokens)].join(" ")];
  }));
}

export function filterRanking(records, filters = {}) {
  const queryTokens = getSearchTokens(filters.query);
  const searchIndex = filters.searchIndex instanceof Map ? filters.searchIndex : new Map();
  const band = filters.band || "all";
  const top = Number(filters.top) || Infinity;

  return records.filter((record) => {
    if (record.rank > top) return false;
    if (band !== "all" && record.band_id !== band) return false;
    if (!queryTokens.length) return true;

    const haystack = [
      ...getSearchTokens(record.company_name, false),
      compact(record.company_id),
      searchIndex.get(record.company_id) || "",
    ].join(" ");
    return queryTokens.some((query) => haystack.includes(query));
  });
}

export function suggestCompanies(records, query, options = {}) {
  const queryTokens = getSearchTokens(query);
  if (!queryTokens.length) return [];

  const searchIndex = options.searchIndex instanceof Map
    ? options.searchIndex
    : buildCompanySearchIndex(records);
  const limit = Math.max(1, Number(options.limit) || 6);
  const candidates = records.map((record) => {
    const name = compact(record.company_name);
    const companyId = compact(record.company_id);
    const indexed = searchIndex.get(record.company_id) || "";
    const matches = queryTokens.some((token) => (
      name.includes(token)
      || companyId.includes(token)
      || indexed.includes(token)
    ));
    if (!matches) return null;

    const score = Math.min(...queryTokens.map((token) => {
      if (name === token) return 0;
      if (name.startsWith(token)) return 1;
      if (name.includes(token)) return 2;
      if (companyId.startsWith(token)) return 3;
      return 4;
    }));
    return { record, score };
  }).filter(Boolean).sort((left, right) => (
    left.score - right.score || left.record.rank - right.record.rank
  ));

  const seen = new Set();
  const suggestions = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.record.company_id)) continue;
    seen.add(candidate.record.company_id);
    suggestions.push(candidate.record);
    if (suggestions.length === limit) break;
  }
  return suggestions;
}

export function paginateRanking(records, requestedPage = 1, pageSize = 50) {
  const size = Math.max(1, Number(pageSize) || 50);
  const pageCount = Math.max(1, Math.ceil(records.length / size));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), pageCount);
  const offset = (page - 1) * size;
  const items = records.slice(offset, offset + size);

  return {
    items,
    page,
    pageCount,
    start: records.length ? offset + 1 : 0,
    end: offset + items.length,
    total: records.length,
  };
}

export function getPageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount]);
  for (let current = page - 2; current <= page + 2; current += 1) {
    if (current > 1 && current < pageCount) pages.add(current);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const window = [];
  sorted.forEach((current, index) => {
    const previous = sorted[index - 1];
    if (index && current - previous > 1) window.push("…");
    window.push(current);
  });
  return window;
}

export function getCompanyRecords(records, companyId) {
  return records
    .filter((record) => record.company_id === companyId)
    .sort((a, b) => a.rank - b.rank);
}

export function buildPeriodIndex(records) {
  const index = new Map();
  records.forEach((record) => {
    const matches = index.get(record.company_id) || [];
    matches.push(record);
    index.set(record.company_id, matches);
  });
  return index;
}

export function describeRankChange(record, previousIndex) {
  const previous = previousIndex.get(record.company_id) || [];
  if (!previous.length) return { type: "new", delta: null, previousRank: null };
  if (previous.length > 1) return { type: "review", delta: null, previousRank: null };

  const previousRank = previous[0].rank;
  const delta = previousRank - record.rank;
  if (delta === 0) return { type: "flat", delta: 0, previousRank };
  return { type: delta > 0 ? "up" : "down", delta: Math.abs(delta), previousRank };
}

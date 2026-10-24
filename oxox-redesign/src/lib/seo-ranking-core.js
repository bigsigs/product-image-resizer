const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function filterSeoCompanies(
  companies,
  { query = "", filter = "all", sortBy = "traffic" } = {},
) {
  const normalizedQuery = normalize(query);

  return [...companies]
    .filter((company) => {
      const matchesQuery = !normalizedQuery || [
        company.brand,
        company.company_name,
        company.domain,
      ].some((value) => normalize(value).includes(normalizedQuery));
      const matchesFilter = filter === "all"
        || (filter === "growing" && company.trafficChange > 0)
        || (filter === "declining" && company.trafficChange < 0)
        || (filter === "ai" && company.mentions > 0);
      return matchesQuery && matchesFilter;
    })
    .sort((left, right) => {
      const leftValue = Number.isFinite(left[sortBy]) ? left[sortBy] : Number.NEGATIVE_INFINITY;
      const rightValue = Number.isFinite(right[sortBy]) ? right[sortBy] : Number.NEGATIVE_INFINITY;
      return rightValue - leftValue || left.brand.localeCompare(right.brand, "zh-CN");
    });
}

export function paginateSeoCompanies(companies, requestedPage = 1, pageSize = 12) {
  const safePageSize = Math.max(1, Math.floor(pageSize) || 1);
  const pageCount = Math.max(1, Math.ceil(companies.length / safePageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const start = (page - 1) * safePageSize;

  return {
    items: companies.slice(start, start + safePageSize),
    page,
    pageCount,
    total: companies.length,
  };
}

export function summarizeSeoCompanies(companies) {
  return companies.reduce(
    (summary, company) => ({
      sites: summary.sites + 1,
      traffic: summary.traffic + (company.traffic ?? 0),
      keywords: summary.keywords + (company.keywords ?? 0),
      backlinks: summary.backlinks + (company.backlinks ?? 0),
      mentions: summary.mentions + (company.mentions ?? 0),
    }),
    { sites: 0, traffic: 0, keywords: 0, backlinks: 0, mentions: 0 },
  );
}

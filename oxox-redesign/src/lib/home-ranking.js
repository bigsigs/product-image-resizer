export function rankSignal(record, currentIndex, previousIndex, hasPrevious = true) {
  const current = currentIndex.get(record.company_id) || [];
  const previous = previousIndex.get(record.company_id) || [];
  if (current.length > 1 || previous.length > 1 || current.some(r => r.source_duplicate) || previous.some(r => r.source_duplicate)) return { type: "review", label: "待核对", delta: null };
  if (!hasPrevious) return { type: "pending", label: "暂无比较", delta: null };
  if (!previous.length) return { type: "new", label: "上期未收录", delta: null };
  const delta = previous[0].rank - record.rank;
  return { type: delta > 0 ? "up" : delta < 0 ? "down" : "flat", label: delta > 0 ? `↑ ${delta}` : delta < 0 ? `↓ ${Math.abs(delta)}` : "— 持平", delta };
}
export function amountGroups(dataset) {
  const definitions = [
    { id: "large", label: "1000万美元及以上", color: "var(--c1)", min: 1000, max: Infinity },
    { id: "medium", label: "300–1000万美元", color: "var(--c2)", min: 300, max: 1000 },
    { id: "small", label: "100–300万美元", color: "var(--c3)", min: 100, max: 300 },
    { id: "under", label: "100万美元以下", color: "var(--ink3)", min: -Infinity, max: 100 },
  ];
  const exact = dataset.period.precision === "exact";
  return definitions.map(definition => {
    const bands = (dataset.bands || []).filter(band => { const value = band.min_usd_10k ?? -Infinity; return value >= definition.min && value < definition.max; });
    let label = definition.label;
    if (!exact && bands.length === 1) label = bands[0].label;
    if (!exact && bands.length > 1) {
      const upper = Math.max(...bands.map(b => b.max_usd_10k ?? -Infinity));
      const lower = Math.min(...bands.map(b => b.min_usd_10k ?? -Infinity));
      label = lower === -Infinity ? `${upper}万美元以下` : `${lower}–${upper}万美元`;
    }
    const group = { ...definition, label, exact, bandIds: bands.map(b => b.id) };
    return { ...group, count: dataset.records.filter(record => matchesAmountGroup(record, group)).length };
  }).filter(group => group.count > 0);
}
export function matchesAmountGroup(record, group) {
  return group.exact ? typeof record.amount_usd_10k === "number" && record.amount_usd_10k >= group.min && record.amount_usd_10k < group.max : group.bandIds.includes(record.band_id);
}

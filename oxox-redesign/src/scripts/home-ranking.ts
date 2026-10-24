// @ts-nocheck
import { buildCompanySearchIndex, buildPeriodIndex, filterRanking, suggestCompanies } from "../lib/ranking-core.js";
import { amountGroups, matchesAmountGroup, rankSignal } from "../lib/home-ranking.js";
const boot = JSON.parse(document.querySelector("#rankingBoot").textContent);
const search = document.querySelector("#rankingSearch");
const suggestions = document.querySelector("#rankingSuggestions");
const periodSelect = document.querySelector("#periodSelect");
const exactShortcut = document.querySelector("#exactPeriodShortcut");
const rows = document.querySelector("#rankingRows");
const more = document.querySelector("#loadMore");
const status = document.querySelector("#rankingStatus");
const error = document.querySelector("#rankingError");
const sourceGapNote = document.querySelector("#sourceGapNote");
const navigationEntry = performance.getEntriesByType("navigation")[0];
if (navigationEntry?.type === "back_forward" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
const format = value => new Intl.NumberFormat("zh-CN").format(value);
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const cache = new Map();
const state = { periodId: boot.latest, dataset: null, previousIndex: new Map(), currentIndex: new Map(), hasPrevious: true, searchIndex: new Map(), groups: [], group: "all", filter: "all", limit: 30, ready: false, activeSuggestion: -1 };
const params = new URLSearchParams(location.search);
const requestedPeriod = params.get("period");
search.value = params.get("q") || "";
function getRestorePoint() {
  try {
    const entry = JSON.parse(sessionStorage.getItem("oxox-ranking-restore") || "null");
    if (!entry?.href) return null;
    const url = new URL(entry.href, location.origin);
    return `${url.pathname}${url.search}${url.hash}` === todayDatasetUrl() ? entry : null;
  } catch { return null; }
}
const previousPeriod = period => boot.periods.find(p => p.as_of < period.as_of && p.as_of.slice(0, 4) === period.as_of.slice(0, 4));
const getDataset = id => {
  if (!cache.has(id)) {
    const period = boot.periods.find(p => p.id === id);
    cache.set(id, fetch(`/data/yueqing-export-ranking/${period.file}`).then(response => {
      if (!response.ok) throw new Error("load");
      return response.json();
    }).catch(reason => { cache.delete(id); throw reason; }));
  }
  return cache.get(id);
};
function rowMarkup(record) {
  const meta = boot.companyMeta[record.company_id];
  const initials = record.company_name.replace(/^(浙江|温州|乐清)(市)?/, "").slice(0, 2);
  const signal = rankSignal(record, state.currentIndex, state.previousIndex, state.hasPrevious);
  const amount = record.amount_label || record.band_label;
  const exact = state.dataset.period.precision === "exact";
  const amountText = exact ? format(record.amount_usd_10k) : amount.replace("万美元", "");
  return `<a class="ranking-row" href="/yueqing-export-ranking/company/${escape(record.company_id)}/" data-rank="${record.rank}"><span class="row-rank ${record.rank <= 3 ? "rank-top" : ""}">${record.rank}</span><span class="company-mark ${meta?.icon && meta?.darkIcon ? "dark-logo" : ""}" aria-hidden="true">${meta?.icon ? `<img src="${escape(meta.icon)}" alt="" width="42" height="42" loading="lazy">` : `<span>${escape(initials)}</span>`}</span><span class="row-company"><b>${escape(record.company_name)}</b>${meta?.domain ? `<span class="company-badge">官网</span>` : ""}<span class="company-subline">${escape(meta?.domain || record.company_id)}${record.source_duplicate ? " · 来源待核对" : ""}</span></span><span class="row-amount">${escape(amountText)}<small>万美元</small></span><span class="row-change ${signal.type}"><span class="mobile-change-label">名次 </span>${signal.label}</span></a>`;
}
function todayDatasetUrl() {
  const url = new URL(location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}
function saveRestorePoint(extra = {}) {
  if (!state.ready) return;
  try {
    sessionStorage.setItem("oxox-ranking-restore", JSON.stringify({
      href: todayDatasetUrl(),
      periodId: state.periodId,
      query: search.value,
      filter: state.filter,
      group: state.group,
      limit: state.limit,
      scrollY: window.scrollY,
      savedAt: Date.now(),
      ...extra,
    }));
  } catch {}
}
function closeSuggestions() {
  suggestions.hidden = true;
  state.activeSuggestion = -1;
  search.setAttribute("aria-expanded", "false");
}
function selectSuggestion(record) {
  search.value = record.company_name;
  state.limit = 30;
  closeSuggestions();
  render();
  saveRestorePoint({ focus: "search" });
  document.querySelector(".ranking-section").scrollIntoView({ block: "start" });
}
function renderSuggestions() {
  if (!state.ready) return closeSuggestions();
  const matches = suggestCompanies(state.dataset.records, search.value, { searchIndex: state.searchIndex, limit: 6 });
  if (!matches.length || !search.value.trim()) return closeSuggestions();
  suggestions.innerHTML = matches.map((record, index) => `<button type="button" role="option" data-company-id="${escape(record.company_id)}" aria-selected="${index === state.activeSuggestion}"><span class="suggestion-rank">#${record.rank}</span><span><b class="suggestion-name">${escape(record.company_name)}</b><small class="suggestion-note">${escape(boot.companyMeta[record.company_id]?.domain || record.company_id)}</small></span><span class="suggestion-arrow" aria-hidden="true">↗</span></button>`).join("");
  suggestions.hidden = false;
  search.setAttribute("aria-expanded", "true");
}
function saveUrl() {
  const url = new URL(location.href);
  for (const [key, value] of [["q", search.value.trim()], ["period", state.periodId === boot.latest ? "" : state.periodId], ["filter", state.filter === "all" ? "" : state.filter], ["band", state.group === "all" ? "" : state.group]]) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
  history.replaceState(null, "", url);
}
function render() {
  if (!state.ready) return;
  let records = filterRanking(state.dataset.records, { query: search.value, searchIndex: state.searchIndex, top: state.filter === "top100" ? 100 : state.filter === "top500" ? 500 : 0 });
  if (state.group !== "all") {
    const group = state.groups.find(g => g.id === state.group);
    if (group) records = records.filter(record => matchesAmountGroup(record, group));
  }
  if (["up", "down"].includes(state.filter)) records = records.filter(record => rankSignal(record, state.currentIndex, state.previousIndex, state.hasPrevious).type === state.filter);
  rows.innerHTML = records.slice(0, state.limit).map(rowMarkup).join("");
  more.hidden = records.length <= state.limit;
  more.disabled = false;
  more.textContent = `显示更多（还有 ${format(Math.max(0, records.length - state.limit))} 条）`;
  document.querySelector("#rankingEmpty").hidden = records.length > 0;
  status.textContent = records.length ? `共 ${format(records.length)} 条记录，已显示 ${format(Math.min(records.length, state.limit))} 条` : "没有匹配的记录";
  document.querySelector("#clearFilters").hidden = !search.value && state.group === "all" && state.filter === "all";
  document.querySelectorAll("#rankTabs [data-filter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === state.filter)));
  document.querySelectorAll("#distributionLegend button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.group === state.group)));
  exactShortcut?.setAttribute("aria-pressed", String(state.dataset.period.precision === "exact"));
  saveUrl();
  renderSuggestions();
}
function reset() { search.value = ""; state.group = "all"; state.filter = "all"; state.limit = 30; render(); }
async function setPeriod(id, options = {}) {
  const period = boot.periods.find(p => p.id === id);
  if (!period) return;
  const previous = previousPeriod(period);
  periodSelect.disabled = true;
  if (exactShortcut) exactShortcut.disabled = true;
  more.disabled = true;
  status.textContent = "正在载入所选周期…";
  error.hidden = true;
  try {
    const [dataset, previousData] = await Promise.all([getDataset(id), previous ? getDataset(previous.id) : null]);
    state.periodId = id; state.dataset = dataset; state.hasPrevious = !!previous;
    state.currentIndex = buildPeriodIndex(dataset.records);
    state.previousIndex = buildPeriodIndex(previousData?.records || []);
    state.groups = amountGroups(dataset); state.group = options.group && options.group !== "all" ? options.group : "all"; state.limit = Number(options.limit) || 30; state.ready = true;
    periodSelect.value = id;
    document.querySelector("#statRecords").textContent = format(dataset.records.length);
    document.querySelector("#tabCount").textContent = format(dataset.records.length);
    document.querySelector("#statBands").textContent = dataset.period.precision === "exact" ? "精准" : dataset.bands.length;
    document.querySelector("#statBandLabel").textContent = dataset.period.precision === "exact" ? "源表金额口径" : "出口额区间";
    document.querySelector("#rankingPeriod").textContent = `${period.label} · ${dataset.period.precision === "exact" ? "精准数值，单位：万美元" : "累计出口额区间，非单月数据"}。`;
    sourceGapNote.hidden = id !== "2026-ytd-08";
    document.querySelector("#amountHeading").textContent = dataset.period.precision === "exact" ? "累计出口额（万美元）" : "累计出口额区间";
    document.querySelector("#changeHeading").textContent = previous ? `较 ${previous.label.replace(/^\d{4}年/, "").replace("（精准数值）", "精准").replace("（区间数据）", "区间")}` : "名次变化";
    document.querySelector("#distributionBar").innerHTML = state.groups.map(g => `<button type="button" data-group="${g.id}" style="--segment:${g.color};flex:${g.count}" title="${escape(g.label)} · ${format(g.count)}" aria-label="${escape(g.label)}：${g.count}条记录"></button>`).join("");
    document.querySelector("#distributionLegend").innerHTML = state.groups.map(g => `<button type="button" data-group="${g.id}" style="--segment:${g.color}" aria-pressed="false"><i aria-hidden="true"></i>${escape(g.label)}<b>${format(g.count)}</b></button>`).join("");
    render();
  } catch {
    error.hidden = false;
    status.textContent = state.ready ? "未能切换周期，仍显示上次载入的数据。" : "当前显示前 30 条排名记录";
    periodSelect.value = state.periodId;
  } finally { periodSelect.disabled = false; more.disabled = !state.ready; if (exactShortcut) exactShortcut.disabled = !state.ready; }
}
async function initialize() {
  const requestedUrl = todayDatasetUrl();
  error.hidden = true;
  try {
    const restore = getRestorePoint();
    const response = await fetch("/data/yueqing-export-ranking/companies.json");
    if (!response.ok) throw new Error("load");
    state.searchIndex = buildCompanySearchIndex(await response.json());
    const restoreFilter = restore?.href === todayDatasetUrl() ? restore.filter : null;
    const restoreGroup = restore?.href === todayDatasetUrl() ? restore.group : null;
    state.filter = ["top100", "top500", "up", "down"].includes(params.get("filter") || restoreFilter) ? (params.get("filter") || restoreFilter) : "all";
    await setPeriod(restore?.href === requestedUrl && boot.periods.some(p => p.id === restore.periodId) ? restore.periodId : boot.periods.some(p => p.id === requestedPeriod) ? requestedPeriod : boot.latest, restore?.href === requestedUrl ? { group: restore.group, limit: restore.limit } : {});
    const requestedGroup = params.get("band") || restoreGroup;
    if (state.ready && state.groups.some(g => g.id === requestedGroup)) { state.group = requestedGroup; render(); }
    if (getRestorePoint()?.href === requestedUrl) {
      const currentRestore = getRestorePoint();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.scrollTo({ left: 0, top: Number(currentRestore.scrollY) || 0, behavior: "instant" });
      if (currentRestore.focus === "search") search.focus({ preventScroll: true });
    }
  } catch { error.hidden = false; }
}
search.addEventListener("input", () => { state.limit = 30; state.activeSuggestion = -1; render(); });
search.addEventListener("focus", renderSuggestions);
search.addEventListener("keydown", event => {
  const options = [...suggestions.querySelectorAll("[role=option]")];
  if (event.key === "Escape") return closeSuggestions();
  if (!options.length) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    state.activeSuggestion = (state.activeSuggestion + delta + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute("aria-selected", String(index === state.activeSuggestion)));
  } else if (event.key === "Enter" && state.activeSuggestion >= 0) {
    event.preventDefault();
    const record = state.dataset.records.find(item => item.company_id === options[state.activeSuggestion].dataset.companyId);
    if (record) selectSuggestion(record);
  }
});
document.querySelector("#rankingSearchForm").addEventListener("submit", event => { event.preventDefault(); state.limit = 30; closeSuggestions(); render(); document.querySelector(".ranking-section").scrollIntoView({ block: "start" }); });
document.querySelector("#rankTabs").addEventListener("click", event => { const button = event.target.closest("[data-filter]"); if (!button) return; state.filter = button.dataset.filter; state.limit = 30; render(); });
document.querySelector(".distribution").addEventListener("click", event => { const button = event.target.closest("[data-group]"); if (!button || !state.ready) return; state.group = state.group === button.dataset.group ? "all" : button.dataset.group; state.limit = 30; render(); });
exactShortcut?.addEventListener("click", () => { if (!periodSelect.disabled) setPeriod(exactShortcut.dataset.period); });
periodSelect.addEventListener("change", () => setPeriod(periodSelect.value));
more.addEventListener("click", () => { const offset = rows.children.length; state.limit += 30; render(); saveRestorePoint(); rows.children[offset]?.focus({ preventScroll: true }); });
document.querySelector("#clearFilters").addEventListener("click", reset);
document.querySelector("[data-reset]").addEventListener("click", reset);
document.querySelector("#retryLoad").addEventListener("click", initialize);
document.addEventListener("keydown", event => { if (event.key === "/" && !event.ctrlKey && !event.metaKey && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !event.target.isContentEditable) { event.preventDefault(); search.focus(); } });
document.addEventListener("click", event => { if (!(event.target instanceof Node) || !event.target.closest(".ranking-search")) closeSuggestions(); });
suggestions.addEventListener("click", event => { const option = event.target.closest("[data-company-id]"); if (!option) return; const record = state.dataset.records.find(item => item.company_id === option.dataset.companyId); if (record) selectSuggestion(record); });
rows.addEventListener("click", event => { const link = event.target.closest(".ranking-row"); if (!link) return; saveRestorePoint({ clickedRank: Number(link.dataset.rank) }); });
window.addEventListener("scroll", () => saveRestorePoint(), { passive: true });
window.addEventListener("pagehide", () => saveRestorePoint());
window.addEventListener("pageshow", event => {
  if (event.persisted) initialize();
});
initialize();

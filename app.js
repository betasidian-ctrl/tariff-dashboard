const data = window.TARIFF_DATA;

const state = {
  view: "matrix",
  level: "large",
  search: "",
  large: "all",
  mid: "all",
  small: "all",
  country: "all",
  status: "all"
};

const el = {
  level: document.querySelector("#levelFilter"),
  search: document.querySelector("#searchInput"),
  large: document.querySelector("#largeFilter"),
  mid: document.querySelector("#midFilter"),
  small: document.querySelector("#smallFilter"),
  country: document.querySelector("#countryFilter"),
  status: document.querySelector("#statusFilter"),
  matrixBody: document.querySelector("#matrixBody"),
  productsBody: document.querySelector("#productsBody"),
  countryGrid: document.querySelector("#countryGrid"),
  missingGrid: document.querySelector("#missingGrid"),
  referenceGrid: document.querySelector("#referenceGrid")
};

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function formatMoney(value) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return `${Math.round(value).toLocaleString("zh-CN")}`;
}

function formatScale(value) {
  if (value >= 40) return "超高";
  if (value >= 20) return "高";
  if (value >= 10) return "中";
  return "低";
}

function optionList(select, values, allLabel) {
  select.innerHTML = `<option value="all">${allLabel}</option>` + values.map(v => `<option value="${v}">${v}</option>`).join("");
}

function initOptions() {
  optionList(el.country, data.countries.map(c => c.country), "全部国家");
  refreshCategoryOptions();
}

function refreshCategoryOptions() {
  const h = data.hierarchy;
  const larges = uniq(h.map(x => x.large));
  optionList(el.large, larges, "全部大类");
  el.large.value = larges.includes(state.large) ? state.large : "all";

  const mids = uniq(h.filter(x => state.large === "all" || x.large === state.large).map(x => x.mid));
  optionList(el.mid, mids, "全部中类");
  el.mid.value = mids.includes(state.mid) ? state.mid : "all";

  const smalls = uniq(h.filter(x =>
    (state.large === "all" || x.large === state.large) &&
    (state.mid === "all" || x.mid === state.mid)
  ).map(x => x.small));
  optionList(el.small, smalls, "全部小类");
  el.small.value = smalls.includes(state.small) ? state.small : "all";
}

function filteredBase() {
  const q = state.search.trim().toLowerCase();
  return data.hierarchy.filter(item => {
    if (state.large !== "all" && item.large !== state.large) return false;
    if (state.mid !== "all" && item.mid !== state.mid) return false;
    if (state.small !== "all" && item.small !== state.small) return false;
    if (state.status !== "all" && item.status !== state.status) return false;
    if (!q) return true;
    return [
      item.large, item.mid, item.small, item.tariffCategory, item.hs,
      item.confidence, item.assumption, item.tariffNote, item.missingFields, ...(item.samples || [])
    ].join(" ").toLowerCase().includes(q);
  });
}

function groupKey(item, level) {
  if (level === "large") return item.large;
  if (level === "mid") return `${item.large}||${item.mid}`;
  return `${item.large}||${item.mid}||${item.small}`;
}

function groupLabel(parts, level) {
  if (level === "large") return parts[0];
  if (level === "mid") return `${parts[0]} / ${parts[1]}`;
  return `${parts[0]} / ${parts[1]} / ${parts[2]}`;
}

function aggregateByLevel() {
  const map = new Map();
  for (const item of filteredBase()) {
    const key = groupKey(item, state.level);
    if (!map.has(key)) {
      const parts = key.split("||");
      map.set(key, {
        key,
        parts,
        level: state.level,
        label: groupLabel(parts, state.level),
        large: parts[0],
        mid: parts[1] || "",
        small: parts[2] || "",
        amount: 0,
        rows: 0,
        materialCount: 0,
        supplierCount: 0,
        statuses: new Set(),
        confidences: new Set(),
        tariffCategories: new Set(),
        hsSet: new Set(),
        notes: new Set(),
        assumptions: new Set(),
        missingFields: new Set(),
        samples: []
      });
    }
    const g = map.get(key);
    g.amount += item.amount || 0;
    g.rows += item.rows || 0;
    g.materialCount += item.materialCount || 0;
    g.supplierCount += item.supplierCount || 0;
    g.statuses.add(item.status);
    g.confidences.add(item.confidence || "低");
    g.tariffCategories.add(item.tariffCategory);
    g.hsSet.add(item.hs);
    g.notes.add(item.tariffNote);
    g.assumptions.add(item.assumption);
    g.missingFields.add(item.missingFields);
    if (g.samples.length < 3) g.samples.push(...(item.samples || []).slice(0, 3 - g.samples.length));
  }
  return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

function statusForGroup(group) {
  if (group.statuses.has("risk")) return "risk";
  if (group.statuses.has("verify")) return "verify";
  return "usable";
}

function statusLabel(status) {
  if (status === "usable") return "可初筛";
  if (status === "risk") return "高风险";
  return "需核验";
}

function confidenceRank(value) {
  return {"高": 4, "中高": 3, "中": 2, "低": 1}[value] || 1;
}

function groupConfidence(group) {
  const list = Array.from(group.confidences || []);
  if (!list.length) return "低";
  return list.sort((a, b) => confidenceRank(a) - confidenceRank(b))[0];
}

function shortList(setLike, limit = 3) {
  return Array.from(setLike || []).filter(Boolean).slice(0, limit).join("；");
}

const RATE_BOOK = [
  { prefix: "7210", us: "60.0%（0%基础 + 10% Section122 + 50% Section232钢）", eu: "0%基础；CBAM另计", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST；DGTR另查", turkey: "0%-10% + 附加税", brazil: "10.8%-12.6%", gcc: "5%", canada: "0%基础；SIMA另查", uk: "0%基础；TRA另查" },
  { prefix: "7411", us: "61.5%（1.5%基础 + 10% Section122 + 50% Section232铜）", eu: "4.8%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "5%-7.5%基础 + SWS/IGST", turkey: "3%-6%", brazil: "10.8%", gcc: "5%", canada: "0%", uk: "0%-4%" },
  { prefix: "7412", us: "63.0%（3.0%基础 + 10% Section122 + 50% Section232铜）", eu: "5.2%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "3%-6%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "0%-4%" },
  { prefix: "7607", us: "65.7%（5.7%基础 + 10% Section122 + 50% Section232铝）", eu: "7.5%基础；CBAM/AD另查", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST；DGTR另查", turkey: "7.5%-10%", brazil: "12.6%", gcc: "5%", canada: "0%基础；SIMA另查", uk: "0%-6%" },
  { prefix: "7608", us: "65.7%（5.7%基础 + 10% Section122 + 50% Section232铝）", eu: "7.5%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST", turkey: "7.5%-10%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "0%-6%" },
  { prefix: "7616.99", us: "62.5%（2.5%基础 + 10% Section122 + 50% Section232铝）", eu: "6%", mx: "15%", jp: "0%-3.9%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST", turkey: "6%", brazil: "12.6%-16%", gcc: "5%", canada: "0%-6%", uk: "6%" },
  { prefix: "7306", us: "60.0%（0%基础 + 10% Section122 + 50% Section232钢）", eu: "0%-3.7%；AD/CBAM另查", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST；DGTR另查", turkey: "0%-3.7%", brazil: "12.6%", gcc: "5%", canada: "0%；SIMA另查", uk: "0%" },
  { prefix: "7311", us: "60.0%（0%基础 + 10% Section122 + 50% Section232钢）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "7326.90", us: "37.9%（2.9%基础 + 10% Section122 + 25% China301采用；钢232视清单另加）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8414.30", us: "35.0%（0%基础 + 10% Section122 + 25% China301采用）", eu: "2.2%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.2%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8415.82", us: "36.4%（1.4%基础 + 10% Section122 + 25% China301采用）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%-14%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8415.90", us: "36.4%（1.4%基础 + 10% Section122 + 25% China301采用）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8413.70", us: "35.0%（0%基础 + 10% Section122 + 25% China301采用）", eu: "1.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "1.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "1.7%" },
  { prefix: "8419.50", us: "39.2%（4.2%基础 + 10% Section122 + 25% China301采用）", eu: "1.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "1.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "1.7%" },
  { prefix: "8481.80", us: "39.0%（4.0%基础 + 10% Section122 + 25% China301采用）", eu: "2.2%-3.2%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.2%-3.2%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8501.31", us: "37.8%（2.8%基础 + 10% Section122 + 25% China301采用）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8501.40", us: "39.0%（4.0%基础 + 10% Section122 + 25% China301采用）", eu: "2.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8504.40", us: "36.5%（1.5%基础 + 10% Section122 + 25% China301采用）", eu: "3.3%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "3.3%", brazil: "12.6%-14%", gcc: "5%", canada: "0%", uk: "3.3%" },
  { prefix: "8537.10", us: "37.7%（2.7%基础 + 10% Section122 + 25% China301采用）", eu: "2.1%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST", turkey: "2.1%", brazil: "12.6%-14%", gcc: "5%", canada: "0%", uk: "2%" },
  { prefix: "8534", us: "35.0%（0%基础 + 10% Section122 + 25% China301采用）", eu: "0%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "0%-10%基础 + SWS/IGST", turkey: "0%", brazil: "0%-12.6%", gcc: "5%", canada: "0%", uk: "0%" },
  { prefix: "8544.42", us: "37.6%（2.6%基础 + 10% Section122 + 25% China301采用）", eu: "3.7%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "3.7%", brazil: "14%-16%", gcc: "5%", canada: "0%", uk: "3.7%" },
  { prefix: "8542.31", us: "35.0%（0%基础 + 10% Section122 + 25% China301采用）", eu: "0%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "0%-10%基础 + SWS/IGST", turkey: "0%", brazil: "0%-12.6%", gcc: "5%", canada: "0%", uk: "0%" },
  { prefix: "9025.19", us: "35.0%（0%基础 + 10% Section122 + 25% China301采用）", eu: "0%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "0%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "0%" },
  { prefix: "3403.99", us: "41.5%（6.5%基础 + 10% Section122 + 25% China301采用）", eu: "3.7%", mx: "15%", jp: "3.25%或RCEP0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "3.7%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "3.7%" },
  { prefix: "3926.90", us: "40.3%（5.3%基础 + 10% Section122 + 25% China301采用）", eu: "6.5%", mx: "15%", jp: "3.9%或RCEP0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "6.5%", brazil: "18%", gcc: "5%", canada: "6.5%", uk: "6.5%" },
  { prefix: "4819.10", us: "10.0%（0%基础 + 10% Section122）", eu: "0%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "0%", brazil: "12.6%", gcc: "5%", canada: "0%", uk: "0%" },
  { prefix: "4415.20", us: "10.0%（0%基础 + 10% Section122）", eu: "0%", mx: "15%", jp: "0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "10%基础 + SWS/IGST", turkey: "0%", brazil: "10.8%-12.6%", gcc: "5%", canada: "0%", uk: "0%" },
  { prefix: "8311.30", us: "40.0%（5.0%基础 + 10% Section122 + 25% China301采用）", eu: "2.7%", mx: "15%", jp: "0%-3.9%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%基础 + SWS/IGST", turkey: "2.7%", brazil: "12.6%", gcc: "5%", canada: "0%-5%", uk: "2.7%" },
  { prefix: "3827", us: "38.7%（3.7%基础 + 10% Section122 + 25% China301采用）", eu: "6.5% + F-gas/配额规则", mx: "15%", jp: "3.9%或RCEP0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST；DGTR另查", turkey: "6.5%", brazil: "12.6%", gcc: "5%", canada: "0%-6.5%", uk: "6.5%" },
  { prefix: "2903", us: "38.7%（3.7%基础 + 10% Section122 + 25% China301采用）", eu: "5.5%-6.5% + F-gas/化学品规则", mx: "15%", jp: "3.9%或RCEP0%", kr: "0%/RCEP", th: "0%/RCEP", vn: "0%/RCEP", india: "7.5%-10%基础 + SWS/IGST", turkey: "5.5%-6.5%", brazil: "12.6%", gcc: "5%", canada: "0%-6.5%", uk: "5.5%-6.5%" },
];

const LANDED_MODEL = {
  "美国": { vat: 0, fee: 0.4714, note: "无进口VAT；含MPF 0.3464% + 海运HMF 0.125%" },
  "欧盟": { vat: 19, fee: 0.3, note: "默认德国进口VAT 19%；清关处理费按0.3%标准化" },
  "墨西哥": { vat: 16, fee: 0.8, note: "IVA 16%；DTA按0.8%标准化" },
  "日本": { vat: 10, fee: 0.2, note: "消费税10%；清关处理费按0.2%标准化" },
  "韩国": { vat: 10, fee: 0.2, note: "进口VAT 10%；清关处理费按0.2%标准化" },
  "泰国": { vat: 7, fee: 0.2, note: "VAT 7%；清关处理费按0.2%标准化" },
  "越南": { vat: 10, fee: 0.2, note: "VAT按10%默认；清关处理费按0.2%标准化" },
  "印度": { vat: 18, fee: 0.2, sws: true, note: "IGST按18%默认；SWS按基础关税10%折算；清关处理费0.2%" },
  "土耳其": { vat: 20, fee: 0.2, note: "VAT 20%；清关处理费按0.2%标准化" },
  "巴西": { vat: 30, fee: 0.5, note: "用PIS/COFINS/IPI/ICMS综合30%做标准模型；实际按州和NCM会变" },
  "沙特/GCC": { vat: 15, fee: 0.2, note: "沙特VAT 15%；GCC清关处理费按0.2%标准化" },
  "加拿大": { vat: 5, fee: 0.2, note: "GST 5%；未含省税/PST/HST；清关处理费0.2%" },
  "英国": { vat: 20, fee: 0.2, note: "Import VAT 20%；清关处理费按0.2%标准化" },
};

const AD_CVD_BOOK = [
  {
    country: "美国",
    prefix: "7608",
    rate: 365.13,
    text: "365.13%（铝挤压件 China-wide cash deposit；若供应商在低税率名单可改低）",
    source: "ITA Aluminum Extrusions A-570-158/C-570-159",
    url: "https://www.trade.gov/final-determinations-ad-cvd-investigations-aluminum-extrusions-multiple-countries"
  },
  {
    country: "美国",
    prefix: "7607",
    rate: 129.82,
    text: "129.82%（默认采用China-wide AD 105.80% + CVD非抽样企业24.02%；已列企业AD 26.60%/29.89%/28.01%，CVD 22.10%或120.81%，按生产商/出口商切换）",
    source: "Federal Register A-570-053 / C-570-054",
    url: "https://www.federalregister.gov/documents/2026/05/27/2026-10525/certain-aluminum-foil-from-the-peoples-republic-of-china-amended-final-results-of-antidumping-duty",
    extraUrl: "https://www.federalregister.gov/documents/2026/02/18/2026-03205/certain-aluminum-foil-from-the-peoples-republic-of-china-final-results-of-countervailing-duty"
  },
  {
    country: "美国",
    prefix: "3827",
    rate: 216.37,
    text: "216.37%（HFC混合制冷剂AD反规避/现金保证金采用值）",
    source: "ITA HFC blends from China",
    url: "https://www.trade.gov/press-release/us-department-commerce-announces-affirmative-preliminary-circumvention-rulings"
  },
  {
    country: "美国",
    prefix: "2903",
    rate: 167.02,
    text: "167.02%（R134a/部分HFC单体China-wide AD采用值；按CAS复核）",
    source: "ITA/Federal Register HFC components",
    url: "https://enforcement.trade.gov/download/factsheets/factsheet-prc-1112-tetrafluoroethane-ad-final-022217.pdf"
  },
  {
    country: "美国",
    prefix: "7210",
    rate: 0,
    text: "0%采用；钢板存在CORE/钢铁贸易救济案号风险，需按钢种和出口商核案号",
    source: "ITA ACCESS / CBP AD-CVD",
    url: "https://access.trade.gov/public/FRNoticesListLayout.aspx"
  },
  {
    country: "美国",
    prefix: "7306",
    rate: 0,
    text: "0%采用；钢管存在AD/CVD案号风险，需按管型/尺寸/出口商核案号",
    source: "ITA ACCESS / CBP AD-CVD",
    url: "https://access.trade.gov/public/FRNoticesListLayout.aspx"
  },
  {
    country: "美国",
    prefix: "7311",
    rate: 0,
    text: "0%采用；钢制压力容器先按232计，AD/CVD按具体案号复核",
    source: "ITA ACCESS / CBP AD-CVD",
    url: "https://access.trade.gov/public/FRNoticesListLayout.aspx"
  },
  {
    country: "欧盟",
    prefix: "7210",
    rate: 50,
    text: "50.00%（欧盟钢铁保障措施：TRQ内0%保障税，超配额适用50% out-of-quota duty；需按CN和配额余额确认是否触发）",
    source: "Regulation (EU) 2026/1384 / Access2Markets",
    url: "https://trade.ec.europa.eu/access-to-markets/en/news/new-eu-safeguards-steel-imports-third-countries",
    extraUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601384"
  },
  {
    country: "欧盟",
    prefix: "7306",
    rate: 50,
    text: "50.00%（欧盟钢铁保障措施：TRQ内0%保障税，超配额适用50% out-of-quota duty；焊接钢管需按CN和配额余额确认）",
    source: "Regulation (EU) 2026/1384 / Access2Markets",
    url: "https://trade.ec.europa.eu/access-to-markets/en/news/new-eu-safeguards-steel-imports-third-countries",
    extraUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202601384"
  },
  {
    country: "印度",
    prefix: "3827",
    rate: 0,
    text: "0%采用；制冷剂DGTR贸易救济高风险，需按化学品和案号确认",
    source: "DGTR",
    url: "https://www.dgtr.gov.in/"
  }
];

function rateForCountry(country, hs) {
  const row = RATE_BOOK.find(item => hs.startsWith(item.prefix));
  if (!row) return "采用默认：按目的国最接近子目查税，暂按15%敏感值";
  const keyMap = { "美国": "us", "欧盟": "eu", "墨西哥": "mx", "日本": "jp", "韩国": "kr", "泰国": "th", "越南": "vn", "印度": "india", "土耳其": "turkey", "巴西": "brazil", "沙特/GCC": "gcc", "加拿大": "canada", "英国": "uk" };
  return row[keyMap[country]] || "采用默认：15%";
}

function adCvdForCountry(country, hs) {
  const hit = AD_CVD_BOOK.find(item => item.country === country && hs.startsWith(item.prefix));
  if (hit) return hit;
  return {
    country,
    prefix: "",
    rate: 0,
    text: "0%采用；未匹配到当前看板内已知AD/CVD案号，仍需按出口商/生产商做最终案号筛查",
    source: "目的国AD/CVD官方系统",
    url: officialAdCvdUrl(country)
  };
}

function officialDutyUrl(country, hs) {
  const cleanHs = String(hs || "").replace(/\s+/g, "");
  const urls = {
    "美国": `https://hts.usitc.gov/search?query=${encodeURIComponent(cleanHs)}`,
    "欧盟": "https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp",
    "墨西哥": "https://www.snice.gob.mx/cs/avi/snice/siavi.html",
    "日本": "https://www.customs.go.jp/english/tariff/",
    "韩国": "https://unipass.customs.go.kr/clip/index.do",
    "泰国": "https://itd.customs.go.th/igtf/en/main_frame.jsp",
    "越南": "https://www.vietnamtradeportal.gov.vn/",
    "印度": "https://www.cbic.gov.in/",
    "土耳其": "https://www.trade.gov.tr/",
    "巴西": "https://www.gov.br/mdic/",
    "沙特/GCC": "https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/customs.aspx",
    "加拿大": "https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/menu-eng.html",
    "英国": "https://www.trade-tariff.service.gov.uk/"
  };
  return urls[country] || "https://www.wto.org/";
}

function officialLandedUrl(country) {
  const urls = {
    "美国": "https://www.help.cbp.gov/s/article/Article-1128?language=en_US",
    "欧盟": "https://taxation-customs.ec.europa.eu/index_en",
    "墨西哥": "https://www.trade.gov/knowledge-product/mexico-import-tariffs",
    "日本": "https://www.customs.go.jp/english/summary/tariff.htm",
    "韩国": "https://www.customs.go.kr/english/main.do",
    "泰国": "https://www.customs.go.th/index.php?lang=en",
    "越南": "https://www.vietnamtradeportal.gov.vn/",
    "印度": "https://www.cbic.gov.in/",
    "土耳其": "https://www.trade.gov.tr/",
    "巴西": "https://www.gov.br/receitafederal/",
    "沙特/GCC": "https://zatca.gov.sa/en/Pages/default.aspx",
    "加拿大": "https://www.cbsa-asfc.gc.ca/import/menu-eng.html",
    "英国": "https://www.gov.uk/import-goods-into-uk"
  };
  return urls[country] || officialDutyUrl(country, "");
}

function officialAdCvdUrl(country) {
  const urls = {
    "美国": "https://access.trade.gov/public/FRNoticesListLayout.aspx",
    "欧盟": "https://trade.ec.europa.eu/access-to-markets/en/content/trade-defence",
    "墨西哥": "https://www.gob.mx/se/acciones-y-programas/upci",
    "印度": "https://www.dgtr.gov.in/",
    "加拿大": "https://www.cbsa-asfc.gc.ca/sima-lmsi/menu-eng.html",
    "英国": "https://www.gov.uk/government/organisations/trade-remedies-authority",
    "巴西": "https://www.gov.br/mdic/",
    "土耳其": "https://www.trade.gov.tr/",
    "越南": "https://www.moit.gov.vn/",
    "泰国": "https://www.thaitr.go.th/",
    "韩国": "https://www.ktc.go.kr/",
    "日本": "https://www.meti.go.jp/english/",
    "沙特/GCC": "https://zatca.gov.sa/en/Pages/default.aspx"
  };
  return urls[country] || "https://www.wto.org/";
}

function sourceUrlForAdCvd(country, hs) {
  return adCvdForCountry(country, hs).url || officialAdCvdUrl(country);
}

function adCvdSourceLinks(country, hs) {
  const ad = adCvdForCountry(country, hs);
  if (ad.extraUrl) {
    return [
      `<a href="${ad.url}" target="_blank" rel="noopener noreferrer">AD官方案号</a>`,
      `<a href="${ad.extraUrl}" target="_blank" rel="noopener noreferrer">CVD官方案号</a>`
    ];
  }
  return [`<a href="${ad.url || officialAdCvdUrl(country)}" target="_blank" rel="noopener noreferrer">AD/CVD或贸易救济</a>`];
}

function firstHs(row) {
  return String(row.hs || "").split("/")[0].trim();
}

function rateLink(label, url, title) {
  return `<a class="rate-link" href="${url}" target="_blank" rel="noopener noreferrer" title="${title || "打开官方来源"}">${label}</a>`;
}

function maxPercent(text) {
  const matches = String(text).match(/\d+(?:\.\d+)?(?=%)/g);
  if (!matches) return 15;
  return Math.max(...matches.map(Number));
}

function formatPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function comprehensiveRate(country, hs, adCvdRate = 0) {
  const dutyText = rateForCountry(country, hs);
  const duty = maxPercent(dutyText);
  const model = LANDED_MODEL[country] || { vat: 10, fee: 0.2, note: "默认VAT 10%；清关处理费0.2%" };
  const sws = model.sws ? duty * 0.1 : 0;
  const vatBaseMultiplier = 1 + (duty + adCvdRate + sws + model.fee) / 100;
  const vatCost = model.vat * vatBaseMultiplier;
  const total = duty + adCvdRate + sws + model.fee + vatCost;
  return {
    duty,
    total,
    text: `${total.toFixed(1)}%（标准CIF=100,000；关税${duty.toFixed(1)}% + ${adCvdRate ? `AD/CVD/救济${adCvdRate.toFixed(2)}% + ` : ""}${model.sws ? `SWS${sws.toFixed(1)}% + ` : ""}税费${model.vat}%按CIF+关税${adCvdRate ? "+AD/CVD/救济" : ""}计 + 清关/处理${model.fee}%）`,
    note: model.note
  };
}

function rateDetailsForGroup(country, group, includeAdCvd = false) {
  const hsList = Array.from(group.hsSet).slice(0, 4);
  return hsList.map(hs => {
    const adRate = includeAdCvd ? adCvdForCountry(country, hs).rate : 0;
    const result = comprehensiveRate(country, hs, adRate);
    return { hs, value: result.total, text: result.text };
  });
}

function maxDetail(details) {
  if (!details.length) return { value: 0, text: "-" };
  return details.reduce((best, item) => item.value > best.value ? item : best, details[0]);
}

function comprehensiveRateForGroup(country, group) {
  return rateDetailsForGroup(country, group).map(item => `${item.hs}: ${item.text}`).join("；");
}

function adCvdForGroup(country, group) {
  const hsList = Array.from(group.hsSet).slice(0, 4);
  return hsList.map(hs => {
    const ad = adCvdForCountry(country, hs);
    return `${hs}: ${ad.text}`;
  }).join("；");
}

function comprehensiveAdCvdForGroup(country, group) {
  return rateDetailsForGroup(country, group, true).map(item => `${item.hs}: ${item.text}`).join("；");
}

function compactRateSummary(country, group) {
  const hsList = Array.from(group.hsSet).slice(0, 4);
  const dutyValues = hsList.map(hs => maxPercent(rateForCountry(country, hs)));
  const adValues = hsList.map(hs => adCvdForCountry(country, hs).rate);
  const landed = maxDetail(rateDetailsForGroup(country, group));
  const landedAd = maxDetail(rateDetailsForGroup(country, group, true));
  const multi = hsList.length > 1 ? "最高 " : "";
  return {
    duty: `${multi}${formatPercent(Math.max(...dutyValues, 0))}`,
    landed: `${multi}${formatPercent(landed.value)}`,
    adCvd: `${multi}${formatPercent(Math.max(...adValues, 0))}`,
    landedAdCvd: `${multi}${formatPercent(landedAd.value)}`
  };
}

function countryRate(country, group) {
  const hsList = Array.from(group.hsSet);
  const categories = Array.from(group.tariffCategories);
  const c = data.countries.find(x => x.country === country);
  const baseRule = c ? c.rule : "需官方税则核验";
  const adoptedRates = hsList.slice(0, 4).map(hs => `${hs}: ${rateForCountry(country, hs)}`).join("；");

  if (country === "美国") {
    if (hsList.some(h => /7210|7306|7326|7318|7607|7608|7411/.test(h))) {
      return `美国采用税率：${adoptedRates}`;
    }
    return `美国采用税率：${adoptedRates || baseRule}`;
  }
  return `${country}采用税率：${adoptedRates || baseRule}`;
}

function nextAction(country, group) {
  const c = data.countries.find(x => x.country === country);
  const base = c ? c.action : "补完整税号";
  const hsList = Array.from(group.hsSet).join("、");
  return `${base} 当前层级覆盖 ${group.tariffCategories.size} 个关税归类，采用HS：${hsList}`;
}

function matrixRows() {
  const groups = aggregateByLevel();
  const countries = state.country === "all" ? data.countries.map(c => c.country) : [state.country];
  const rows = [];
  for (const group of groups) {
    for (const country of countries) {
      const status = statusForGroup(group);
      const compact = compactRateSummary(country, group);
      rows.push({
        status,
        level: group.level,
        label: group.label,
        amount: group.amount,
        materialCount: group.materialCount,
        supplierCount: group.supplierCount,
        hs: Array.from(group.hsSet).slice(0, 5).join(" / "),
        country,
        rate: countryRate(country, group),
        landedRate: comprehensiveRateForGroup(country, group),
        adCvd: adCvdForGroup(country, group),
        landedAdCvd: comprehensiveAdCvdForGroup(country, group),
        dutyShort: compact.duty,
        landedShort: compact.landed,
        adCvdShort: compact.adCvd,
        landedAdCvdShort: compact.landedAdCvd,
        action: nextAction(country, group),
        source: data.countries.find(c => c.country === country)?.source || "-",
        samples: group.samples,
        categories: Array.from(group.tariffCategories).join(" / "),
        confidence: groupConfidence(group),
        assumptions: shortList(group.assumptions),
        missingFields: shortList(group.missingFields)
      });
    }
  }
  return rows;
}

function renderMetrics() {
  document.querySelector("#countryCount").textContent = data.countries.length;
  document.querySelector("#productCount").textContent = uniq(data.hierarchy.map(x => x.large)).length;
  document.querySelector("#midCount").textContent = uniq(data.hierarchy.map(x => `${x.large}/${x.mid}`)).length;
  document.querySelector("#smallCount").textContent = data.hierarchy.length;
}

function renderMatrix() {
  const rows = matrixRows();
  el.matrixBody.innerHTML = rows.map((row, idx) => `
    <tr data-index="${idx}">
      <td><span class="badge ${row.status}">${statusLabel(row.status)}</span></td>
      <td>${row.level === "large" ? "大类" : row.level === "mid" ? "中类" : "小类"}</td>
      <td>${row.label}<br><span class="muted">${row.categories}</span></td>
      <td>${formatScale(row.amount)}<br><span class="muted">${row.materialCount} 个物料</span></td>
      <td>${row.hs}<br><span class="muted">置信度：${row.confidence}</span></td>
      <td>${row.country}</td>
      <td class="num">${rateLink(row.dutyShort, officialDutyUrl(row.country, firstHs(row)), "打开目的国官方税则")}</td>
      <td class="num">${rateLink(row.landedShort, officialLandedUrl(row.country), "打开进口税费/清关费来源")}</td>
      <td class="num ${row.adCvdShort !== "0.0%" ? "danger-num" : ""}">${rateLink(row.adCvdShort, sourceUrlForAdCvd(row.country, firstHs(row)), "打开AD/CVD或贸易救济来源")}</td>
      <td class="num ${row.adCvdShort !== "0.0%" ? "danger-num" : ""}">${rateLink(row.landedAdCvdShort, sourceUrlForAdCvd(row.country, firstHs(row)), "打开含AD/CVD/救济综合税费来源")}</td>
      <td><button class="link-button" type="button">查看说明</button></td>
    </tr>
  `).join("");
  Array.from(el.matrixBody.querySelectorAll("tr")).forEach((tr, idx) => {
    tr.addEventListener("click", () => selectDetail(rows[idx]));
  });
}

function renderProducts() {
  const rows = filteredBase().sort((a, b) => b.amount - a.amount);
  el.productsBody.innerHTML = rows.map(item => `
    <tr>
      <td>${item.large}</td>
      <td>${item.mid}</td>
      <td>${item.small}</td>
      <td>${item.tariffCategory}<br><span class="badge ${item.status}">${statusLabel(item.status)}</span><br><span class="muted">置信度：${item.confidence}</span></td>
      <td>${item.hs}</td>
      <td>${formatScale(item.amount)}</td>
      <td>${item.materialCount}</td>
      <td>${(item.samples || []).slice(0, 1).join("<br>") || "-"}</td>
    </tr>
  `).join("");
}

function renderCountries() {
  el.countryGrid.innerHTML = data.countries.map(c => `
    <article class="country-item">
      <span class="badge ${/高/.test(c.risk) ? "risk" : "verify"}">${c.risk}</span>
      <h4>${c.country}</h4>
      <p><strong>口径：</strong>${c.rule}</p>
      <p><strong>下一步：</strong>${c.action}</p>
      <p><strong>来源：</strong>${c.source}</p>
    </article>
  `).join("");
}

function renderMissing() {
  el.missingGrid.innerHTML = data.missing.map(row => `
    <article class="missing-item">
      <h4>${row[0]}</h4>
      <p><strong>要补：</strong>${row[1]}</p>
      <p><strong>原因：</strong>${row[2]}</p>
      <p><strong>影响：</strong>${row[3]}</p>
    </article>
  `).join("");
}

function renderReferences() {
  const rows = [
    ["标准模型", "CIF=100,000；海运；1CBM/100kg/100件。综合税费按关税、进口VAT/GST/消费税、清关/处理费折算。"],
    ["表格数字", "大类/中类含多个HS时，主表显示最高税率，便于快速识别成本压力；点击行看完整HS拆分。"],
    ["美国", "无进口VAT；综合税费含MPF 0.3464%和海运HMF 0.125%；Section 122/232/301已进入采用关税率。"],
    ["AD/CVD/救济", "只把已能对应到公开案号、现金保证金或保障措施公式的项目并入含AD/CVD/救济综合；7607铝箔默认采用美国A-570-053/C-570-054当前现金保证金组合，欧盟7210/7306钢材按TRQ外50%保障税做高风险口径，企业级/配额状态需进一步确认。"],
    ["欧盟/墨西哥/日本", "欧盟默认德国进口VAT 19%；墨西哥含IVA 16%和DTA 0.8%；日本含消费税10%。"],
    ["每日更新", "自动化每日核验官方来源后更新看板数据；若没有官方有效变动，保留原数据并写明检查结果。"]
  ];
  el.referenceGrid.innerHTML = rows.map(row => `
    <article class="reference-item">
      <h4>${row[0]}</h4>
      <p>${row[1]}</p>
    </article>
  `).join("");
}

function selectDetail(row) {
  const badge = document.querySelector("#detailBadge");
  badge.className = `badge ${row.status}`;
  badge.textContent = statusLabel(row.status);
  document.querySelector("#detailTitle").textContent = `${row.country} / ${row.label}`;
  document.querySelector("#detailRate").textContent = row.rate;
  document.querySelector("#detailLanded").textContent = row.landedRate;
  document.querySelector("#detailLandedNote").textContent = (LANDED_MODEL[row.country] || {}).note || "标准模型：CIF=100,000，海运，1CBM/100kg/100件。";
  document.querySelector("#detailAdCvd").textContent = row.adCvd;
  document.querySelector("#detailLandedAdCvd").textContent = row.landedAdCvd;
  document.querySelector("#detailRisk").textContent = `${row.categories}；采用HS：${row.hs}；置信度：${row.confidence}；样例：${(row.samples || []).join("；") || "-"}`;
  document.querySelector("#detailAction").textContent = row.action;
  document.querySelector("#detailSource").innerHTML = [
    `<a href="${officialDutyUrl(row.country, firstHs(row))}" target="_blank" rel="noopener noreferrer">官方税则</a>`,
    `<a href="${officialLandedUrl(row.country)}" target="_blank" rel="noopener noreferrer">进口税费/清关费</a>`,
    ...adCvdSourceLinks(row.country, firstHs(row))
  ].join(" / ");
  document.querySelector("#detailAssumption").textContent = row.assumptions || "-";
  document.querySelector("#detailMissing").textContent = row.missingFields || "-";
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach(node => node.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
}

function exportCsv() {
  const rows = matrixRows();
  const header = ["状态", "层级", "分类", "规模", "物料数", "采用HS", "置信度", "默认假设", "缺少字段", "国家", "关税率", "综合税费率", "AD/CVD/救济", "含AD/CVD/救济综合", "关税明细", "综合税费明细", "AD/CVD/救济明细", "含AD/CVD/救济明细", "下一步", "来源"];
  const csv = [header, ...rows.map(r => [statusLabel(r.status), r.level, r.label, formatScale(r.amount), r.materialCount, r.hs, r.confidence, r.assumptions, r.missingFields, r.country, r.dutyShort, r.landedShort, r.adCvdShort, r.landedAdCvdShort, r.rate, r.landedRate, r.adCvd, r.landedAdCvd, r.action, r.source])]
    .map(line => line.map(v => `"${String(v).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tariff-dashboard-filter.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function renderAll() {
  refreshCategoryOptions();
  renderMetrics();
  renderMatrix();
  renderProducts();
  renderCountries();
  renderMissing();
  renderReferences();
  const first = matrixRows()[0];
  if (first) selectDetail(first);
}

initOptions();

el.level.addEventListener("change", e => { state.level = e.target.value; renderAll(); });
el.search.addEventListener("input", e => { state.search = e.target.value; renderAll(); });
el.large.addEventListener("change", e => { state.large = e.target.value; state.mid = "all"; state.small = "all"; renderAll(); });
el.mid.addEventListener("change", e => { state.mid = e.target.value; state.small = "all"; renderAll(); });
el.small.addEventListener("change", e => { state.small = e.target.value; renderAll(); });
el.country.addEventListener("change", e => { state.country = e.target.value; renderAll(); });
el.status.addEventListener("change", e => { state.status = e.target.value; renderAll(); });
document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchView(tab.dataset.view)));
document.querySelector("#exportBtn").addEventListener("click", exportCsv);

renderAll();

# OXOX 乐清出口排行榜

[oxox.cn](https://oxox.cn/) 的累计出口排行榜、企业跨期档案，以及独立的 SEO 榜单、外贸月报和图片工具。

## 本地开发

```sh
npm install
npm run dev
```

## 添加新工具

编辑 `src/data/tools.js`，复制一个工具对象并修改：

- `title`：工具名称
- `description`：一句话说明
- `category`：`image`、`copy` 或 `calculate`
- `url`：工具地址
- `status`：已上线使用 `live`，预告使用 `planned`
- `icon`：对应 `icons` 对象中的图标名称

页面由 Astro 构建为纯静态 HTML，并通过 GitHub Actions 发布到 GitHub Pages。

```sh
npm test
npm run build
```

## 乐清出口排名数据

排名页位于 `/yueqing-export-ranking/`，静态数据保存在
`public/data/yueqing-export-ranking/`：

- `periods.json`：已确认的数据周期和最新周期
- `companies.json`：跨期稳定企业编号、标准名称与别名
- `2026-ytd-06.json`：2026 年 1—6 月累计排名
- `2026-ytd-05.json`：2026 年 1—5 月累计排名
- `2026-ytd-04.json`：2026 年 1—4 月累计排名
- `2026-ytd-03.json`：2026 年 1—3 月累计排名
- `2026-ytd-02.json`：2026 年 1—2 月累计排名
- `2025-ytd-12.json`：2025 年 1—12 月累计出口排名
- `2025-ytd-06.json`：2025 年 1—6 月累计出口排名

导入文本排名时使用 `scripts/import_yueqing_text_ranking.py`。文字识别造成的企业名称差异必须先人工确认，再登记到
`scripts/yueqing-company-aliases.json`；导入器不会自动模糊合并企业。

## 乐清 SEO 观察台

SEO 观察台位于 `/yueqing-seo/`，当前快照数据保存在
`src/data/seo-companies.js`，筛选、排序、汇总和分页逻辑位于
`src/lib/seo-ranking-core.js`，公司图标位于 `public/company-icons/`。
自然流量、关键词、反向链接及 AI 可见度来自 Semrush，属于第三方
估算指标，只用于相对排名与趋势观察；精确数据以企业自己的 Google
Search Console 为准。

## 排行榜首页与企业档案

首页直接展示真实榜单，支持名称／拼音／编号搜索、周期切换、金额区间分布筛选、Top 100／500、名次升降与逐批加载。前 30 条记录在静态 HTML 中可直接访问；交互数据加载失败时仍保留这些记录并提供重试。

- 首页：`src/pages/index.astro`，交互：`src/scripts/home-ranking.ts`
- 企业档案：`src/pages/yueqing-export-ranking/company/[companyId].astro`
- 共享样式：`src/styles/reference.css`，导航：`src/components/SiteHeader.astro`
- 工具目录：`/tools/`；完整口径说明：`/about-data/`

继续补充企业资料时，编辑 `public/data/yueqing-export-ranking/company-profiles.json`，以稳定企业编号为键添加已确认的官网 `links` 或工商信息 `details`。没有内容的模块不会显示。周期排名仍放在各期 JSON 中，与企业资料分开维护；保留真实零值、缺号与同名重复记录，不用缺失值补零。

本地图标位于 `public/company-icons/`，新增图标时同步 `src/data/company-icons.js` 的域名清单。首页与详情页使用相同的本地图标映射，未收录图标时显示企业名称文字标记。

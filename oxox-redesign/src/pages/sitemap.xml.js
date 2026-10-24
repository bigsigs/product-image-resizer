import { getCollection } from "astro:content";
import companies from "../../public/data/yueqing-export-ranking/companies.json";

export const prerender = true;

const escapeXml = (value) => String(value).replace(/[<>&'\"]/g, (character) => ({
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  "'": "&apos;",
  '"': "&quot;",
})[character]);

export async function GET() {
  const articles = await getCollection("articles");
  const staticUrls = [
    "/",
    "/yueqing-export-ranking/",
    "/yueqing-seo/",
    "/articles/",
    "/tools/",
    "/about-data/",
    "/product-image-resizer/",
    "/webp-converter/",
  ];
  const urls = [
    ...staticUrls,
    ...articles.map((article) => `/articles/${article.id}/`),
    ...companies.map((company) => `/yueqing-export-ranking/company/${company.company_id}/`),
  ];
  const body = urls
    .map((path) => `  <url><loc>${escapeXml(new URL(path, "https://oxox.cn").href)}</loc></url>`)
    .join("\n");

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

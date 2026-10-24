import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.literal("monthly-report"),
    categoryLabel: z.string(),
    period: z.string(),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    publishedAt: z.coerce.date(),
    featured: z.boolean().default(false),
    draft: z.boolean().default(false),
    stats: z.array(z.object({
      label: z.string(),
      value: z.string(),
      change: z.string(),
      tone: z.enum(["up", "down", "neutral"]).default("up"),
    })).length(4),
  }),
});

export const collections = { articles };

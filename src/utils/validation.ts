// ============================================
// Request Validation (Zod)
// ============================================

import { z } from "zod";

export const AnalyzeSchema = z.object({
  product: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name too long"),
  competitors: z
    .array(z.string().max(100))
    .max(5, "Maximum 5 competitors")
    .optional(),
  timeRange: z.enum(["7d", "30d", "90d", "1y", "all"]).default("90d"),
  sources: z
    .array(z.enum(["reddit", "hn", "youtube", "amazon"]))
    .default(["reddit", "hn", "youtube", "amazon"]),
  category: z
    .enum(["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"])
    .default("default"),
});

export const CompareSchema = z.object({
  products: z
    .array(z.string().min(1).max(100))
    .min(2, "Need at least 2 products to compare")
    .max(5, "Maximum 5 products"),
  timeRange: z.enum(["7d", "30d", "90d", "1y", "all"]).default("90d"),
  sources: z
    .array(z.enum(["reddit", "hn", "youtube", "amazon"]))
    .default(["reddit", "hn", "youtube", "amazon"]),
  category: z
    .enum(["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"])
    .default("default"),
});

export const MonitorSchema = z.object({
  product: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name too long"),
  since: z.string().datetime().optional(), // ISO 8601 timestamp
  sources: z
    .array(z.enum(["reddit", "hn", "youtube", "amazon"]))
    .default(["reddit", "hn"]),
  category: z
    .enum(["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"])
    .default("default"),
});

export type AnalyzeInput = z.infer<typeof AnalyzeSchema>;
export type CompareInput = z.infer<typeof CompareSchema>;
export type MonitorInput = z.infer<typeof MonitorSchema>;

// ============================================
// API Routes
// Three endpoints, three pricing tiers:
//   POST /analyze   — $0.05  Full reputation report
//   POST /compare   — $0.08  Head-to-head comparison
//   POST /monitor   — $0.03  Quick sentiment pulse
// ============================================

import { Router, Request, Response } from "express";
import { searchHN } from "../services/hn.js";
import { searchReddit } from "../services/reddit.js";
import { searchYouTube } from "../services/youtube.js";
import { searchAmazon } from "../services/amazon.js";
import { analyzeReputation } from "../services/llm.js";
import {
  AnalyzeSchema,
  CompareSchema,
  MonitorSchema,
} from "../utils/validation.js";
import { TTLCache } from "../utils/search-helpers.js";
import type { RawPost, ReputationReport } from "../types.js";

export const apiRouter = Router();

// ─── Cache (15 min TTL) ─────────────────────
const analyzeCache = new TTLCache<any>(15);
const compareCache = new TTLCache<any>(15);
const monitorCache = new TTLCache<any>(5); // shorter TTL for pulse checks

// ─────────────────────────────────────────────
// POST /analyze — Full reputation analysis
// ─────────────────────────────────────────────
apiRouter.post("/analyze", async (req: Request, res: Response) => {
  try {
    const input = AnalyzeSchema.parse(req.body);
    const { product, competitors, timeRange, sources, category } = input;

    // Check cache first
    const cacheKey = TTLCache.buildKey({ product, competitors, timeRange, sources, category });
    const cached = analyzeCache.get(cacheKey);
    if (cached) return res.json(cached);

    console.log(`\n[Analyze] Product: "${product}" | Sources: ${sources.join(",")} | Range: ${timeRange}`);

    // Fetch data from all requested sources in parallel
    const fetchPromises: Promise<RawPost[]>[] = [];

    if (sources.includes("reddit")) {
      fetchPromises.push(searchReddit(product, timeRange, category));
    }
    if (sources.includes("hn")) {
      fetchPromises.push(searchHN(product, timeRange, category));
    }
    if (sources.includes("youtube")) {
      fetchPromises.push(searchYouTube(product, timeRange));
    }
    if (sources.includes("amazon")) {
      fetchPromises.push(searchAmazon(product, timeRange, category));
    }

    const results = await Promise.allSettled(fetchPromises);
    const allPosts: RawPost[] = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<RawPost[]>).value);

    if (allPosts.length === 0) {
      return res.status(404).json({
        error: "No data found",
        message: `No community discussions found for "${product}". Try a different product name or broader time range.`,
      });
    }

    // Run LLM analysis
    const report = await analyzeReputation({
      product,
      posts: allPosts,
      competitors,
    });

    // Cache the result
    analyzeCache.set(cacheKey, report);

    return res.json(report);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        error: "Validation error",
        details: err.errors,
      });
    }
    console.error("[Analyze] Error:", err);
    return res.status(500).json({
      error: "Analysis failed",
      message: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// POST /compare — Head-to-head comparison
// ─────────────────────────────────────────────
apiRouter.post("/compare", async (req: Request, res: Response) => {
  try {
    const input = CompareSchema.parse(req.body);
    const { products, timeRange, sources, category } = input;

    // Check cache first
    const cacheKey = TTLCache.buildKey({ products, timeRange, sources, category });
    const cached = compareCache.get(cacheKey);
    if (cached) return res.json(cached);

    console.log(`\n[Compare] Products: ${products.join(" vs ")} | Range: ${timeRange}`);

    // Analyze each product, with others as competitors
    const reports: ReputationReport[] = [];

    for (const product of products) {
      const competitors = products.filter((p) => p !== product);

      const fetchPromises: Promise<RawPost[]>[] = [];
      if (sources.includes("reddit")) {
        fetchPromises.push(searchReddit(product, timeRange, category));
      }
      if (sources.includes("hn")) {
        fetchPromises.push(searchHN(product, timeRange, category));
      }
      if (sources.includes("youtube")) {
        fetchPromises.push(searchYouTube(product, timeRange));
    }
    if (sources.includes("amazon")) {
      fetchPromises.push(searchAmazon(product, timeRange, category));
      }

      const results = await Promise.allSettled(fetchPromises);
      const allPosts: RawPost[] = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => (r as PromiseFulfilledResult<RawPost[]>).value);

      if (allPosts.length > 0) {
        const report = await analyzeReputation({
          product,
          posts: allPosts,
          competitors,
        });
        reports.push(report);
      }
    }

    if (reports.length < 2) {
      return res.status(404).json({
        error: "Insufficient data",
        message:
          "Could not find enough data for at least 2 products to compare.",
      });
    }

    // Build comparison matrix
    const comparison = {
      products: reports.map((r) => ({
        product: r.product,
        overallScore: r.overallScore,
        overallSentiment: r.overallSentiment,
        confidence: r.confidence,
        totalDataPoints: r.totalDataPoints,
        dimensions: Object.fromEntries(
          r.dimensions.map((d) => [d.dimension, d.score])
        ),
      })),
      winner: reports.reduce((a, b) =>
        a.overallScore > b.overallScore ? a : b
      ).product,
      dimensionLeaders: buildDimensionLeaders(reports),
      generatedAt: new Date().toISOString(),
      fullReports: reports,
    };

    // Cache the result
    compareCache.set(cacheKey, comparison);

    return res.json(comparison);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        error: "Validation error",
        details: err.errors,
      });
    }
    console.error("[Compare] Error:", err);
    return res.status(500).json({
      error: "Comparison failed",
      message: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// POST /monitor — Quick sentiment pulse
// Cheaper, faster — last 7 days, minimal LLM
// ─────────────────────────────────────────────
apiRouter.post("/monitor", async (req: Request, res: Response) => {
  try {
    const input = MonitorSchema.parse(req.body);
    const { product, sources } = input;

    // Check cache first (5 min TTL for monitor)
    const cacheKey = TTLCache.buildKey({ product, sources, type: "monitor" });
    const cached = monitorCache.get(cacheKey);
    if (cached) return res.json(cached);

    console.log(`\n[Monitor] Product: "${product}" | Quick pulse check`);

    const fetchPromises: Promise<RawPost[]>[] = [];
    if (sources.includes("reddit")) {
      fetchPromises.push(searchReddit(product, "7d"));
    }
    if (sources.includes("hn")) {
      fetchPromises.push(searchHN(product, "7d"));
    }
    if (sources.includes("amazon")) {
      fetchPromises.push(searchAmazon(product, "7d", "default"));
    }

    const results = await Promise.allSettled(fetchPromises);
    const allPosts: RawPost[] = results
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => (r as PromiseFulfilledResult<RawPost[]>).value);

    // Lightweight response — counts + basic metrics, no deep LLM analysis
    const pulse = {
      product,
      period: "7d",
      totalMentions: allPosts.length,
      sources: {
        reddit: allPosts.filter((p) => p.source === "reddit").length,
        hn: allPosts.filter((p) => p.source === "hn").length,
      },
      avgScore:
        allPosts.length > 0
          ? Math.round(
              allPosts.reduce((s, p) => s + p.score, 0) / allPosts.length
            )
          : 0,
      topPosts: allPosts
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => ({
          title: p.title,
          source: p.source,
          score: p.score,
          url: p.url,
          date: p.createdAt,
        })),
      // If we have enough data, run a quick LLM summary
      ...(allPosts.length >= 5
        ? { quickAnalysis: await quickSentiment(product, allPosts) }
        : {}),
      generatedAt: new Date().toISOString(),
    };

    // Cache the result
    monitorCache.set(cacheKey, pulse);

    return res.json(pulse);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return res.status(400).json({
        error: "Validation error",
        details: err.errors,
      });
    }
    console.error("[Monitor] Error:", err);
    return res.status(500).json({
      error: "Monitor failed",
      message: err.message,
    });
  }
});

// ─────────────────────────────────────────────
// GET /health — Free, no payment required
// ─────────────────────────────────────────────
apiRouter.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "x402-product-reputation-api",
    version: "1.1.0",
    endpoints: {
      "POST /analyze": {
        price: process.env.PRICE_ANALYZE || "$0.05",
        description: "Full reputation analysis with dimensional scoring",
      },
      "POST /compare": {
        price: process.env.PRICE_COMPARE || "$0.08",
        description: "Head-to-head comparison of 2-5 products",
      },
      "POST /monitor": {
        price: process.env.PRICE_MONITOR || "$0.03",
        description: "Quick 7-day sentiment pulse",
      },
    },
    dataSources: ["Reddit", "Hacker News (Algolia)", "YouTube Transcripts"],
    paymentNetwork: process.env.NETWORK || "eip155:84532",
    cache: {
      analyze: analyzeCache.size,
      compare: compareCache.size,
      monitor: monitorCache.size,
    },
  });
});

// ─────────────────────────────────────────────
// Discovery: MCP + A2A agent card
// ─────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://localhost:4021";

apiRouter.get("/.well-known/mcp.json", (_req: Request, res: Response) => {
  res.json({
    schema_version: "1.0",
    name: "Product Reputation API",
    description: "AI-powered product reputation intelligence from Reddit, Hacker News, and YouTube. Returns structured scores, dimensional analysis, and competitor comparisons.",
    url: BASE_URL,
    payment: { protocol: "x402", network: process.env.NETWORK || "eip155:84532", asset: "USDC" },
    tools: [
      {
        name: "analyze_reputation",
        description: "Full reputation report with dimensional scoring and competitor comparison",
        endpoint: "/analyze",
        method: "POST",
        parameters: {
          product: { type: "string", required: true, description: "Product name to analyze" },
          competitors: { type: "array", items: { type: "string" }, description: "Optional competitor names" },
          timeRange: { type: "string", enum: ["7d", "30d", "90d", "1y", "all"], description: "Analysis time window" },
          category: { type: "string", enum: ["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"] },
        },
        price: "$0.05",
      },
      {
        name: "compare_products",
        description: "Head-to-head reputation comparison of 2-5 products",
        endpoint: "/compare",
        method: "POST",
        parameters: {
          products: { type: "array", items: { type: "string" }, required: true, description: "2-5 product names" },
          timeRange: { type: "string", enum: ["7d", "30d", "90d", "1y", "all"] },
          category: { type: "string", enum: ["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"] },
        },
        price: "$0.08",
      },
      {
        name: "monitor_sentiment",
        description: "Quick 7-day sentiment pulse for a product",
        endpoint: "/monitor",
        method: "POST",
        parameters: {
          product: { type: "string", required: true },
          category: { type: "string", enum: ["default", "saas", "devtools", "ai", "crypto", "hardware", "fintech"] },
        },
        price: "$0.03",
      },
      {
        name: "health_check",
        description: "Service info and available endpoints",
        endpoint: "/health",
        method: "GET",
        parameters: {},
        price: "free",
      },
    ],
  });
});

apiRouter.get("/.well-known/agent.json", (_req: Request, res: Response) => {
  res.json({
    name: "Product Reputation Intelligence Agent",
    description: "AI-powered product reputation analysis from Reddit, HN, and YouTube. Structured scores, dimensional breakdowns, and competitor maps.",
    url: BASE_URL,
    version: "1.1.0",
    capabilities: {
      x402: { supported: true, network: process.env.NETWORK || "eip155:84532", asset: "USDC" },
    },
    skills: [
      { id: "analyze", name: "Reputation Analysis", endpoint: "/analyze", price: "$0.05 USDC" },
      { id: "compare", name: "Product Comparison", endpoint: "/compare", price: "$0.08 USDC" },
      { id: "monitor", name: "Sentiment Pulse", endpoint: "/monitor", price: "$0.03 USDC" },
      { id: "health", name: "Health Check", endpoint: "/health", price: "free" },
    ],
    provider: { name: "OpenClaw" },
  });
});

// ─── Helpers ────────────────────────────────

function buildDimensionLeaders(
  reports: ReputationReport[]
): Record<string, string> {
  const allDimensions = new Set(
    reports.flatMap((r) => r.dimensions.map((d) => d.dimension))
  );

  const leaders: Record<string, string> = {};
  for (const dim of allDimensions) {
    let bestProduct = "";
    let bestScore = -1;

    for (const report of reports) {
      const dimScore = report.dimensions.find(
        (d) => d.dimension === dim
      )?.score;
      if (dimScore !== undefined && dimScore > bestScore) {
        bestScore = dimScore;
        bestProduct = report.product;
      }
    }

    if (bestProduct) leaders[dim] = bestProduct;
  }

  return leaders;
}

async function quickSentiment(
  product: string,
  posts: RawPost[]
): Promise<{ sentiment: string; summary: string }> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { sentiment: "unknown", summary: "LLM not configured" };

    const sample = posts
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((p) => `[${p.source}] ${p.title}: ${p.body.slice(0, 200)}`)
      .join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `In 2 sentences, summarize the current community sentiment about "${product}" based on these recent posts. Then give a one-word sentiment label (positive/mixed/negative). Respond as JSON: {"sentiment": "...", "summary": "..."}\n\n${sample}`,
          },
        ],
      }),
    });

    if (!response.ok) return { sentiment: "unknown", summary: "Analysis unavailable" };

    const data = await response.json();
    const text = data.content[0]?.text || "";
    const clean = text.replace(/```json\s*|```\s*/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { sentiment: "unknown", summary: "Quick analysis failed" };
  }
}

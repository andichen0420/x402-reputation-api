// ============================================
// LLM Analysis Service
// Uses Claude to analyze raw posts and produce
// structured reputation scores + dimensions
// ============================================

import type {
  RawPost,
  LLMAnalysisInput,
  LLMAnalysisOutput,
  DimensionScore,
  CompetitorComparison,
  SourceSummary,
  ReputationReport,
} from "../types.js";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

/**
 * Core analysis: takes raw posts and produces a structured reputation report
 */
export async function analyzeReputation(
  input: LLMAnalysisInput
): Promise<ReputationReport> {
  const { product, posts, competitors } = input;

  // Prepare condensed post data for the LLM
  const condensedPosts = posts
    .sort((a, b) => b.score - a.score) // Prioritize high-signal posts
    .slice(0, 80) // Keep within context window
    .map((p, i) => ({
      i,
      src: p.source,
      title: p.title.slice(0, 100),
      body: p.body.slice(0, 500),
      score: p.score,
      date: p.createdAt?.split("T")[0],
    }));

  const competitorClause = competitors?.length
    ? `\n\nAlso compare "${product}" against these competitors: ${competitors.join(", ")}. For each competitor, provide relative strengths/weaknesses and dimension scores based on what the data reveals.`
    : "";

  const systemPrompt = `You are a product reputation analyst. You analyze community discussions from Reddit, Hacker News, and YouTube to produce structured reputation reports.

Your analysis must be:
- Evidence-based: every score must be justified by the data
- Nuanced: capture both praise and criticism
- Dimensional: break reputation into meaningful aspects
- Quantified: use 0-100 scores consistently

CRITICAL: You MUST use dimensions from this standardized list. Pick 4-8 that are relevant to the product:
- "Performance"
- "Developer Experience"
- "Pricing"
- "Documentation"
- "Reliability"
- "Support"
- "Security"
- "Ease of Use"
- "Scalability"
- "Community"
- "AI Features"
- "Vendor Lock-in"

Do NOT invent dimension names outside this list. This ensures comparability across products.

Respond ONLY with valid JSON matching the specified schema. No markdown, no explanations outside the JSON.`;

  const userPrompt = `Analyze the reputation of "${product}" based on ${posts.length} community posts from Reddit, Hacker News, and YouTube.

DATA:
${JSON.stringify(condensedPosts, null, 0)}
${competitorClause}

Respond with this exact JSON structure:
{
  "overallScore": <0-100>,
  "overallSentiment": "positive" | "mixed" | "negative",
  "confidence": <0.0-1.0, based on data volume and consistency>,
  "dimensions": [
    {
      "dimension": "<MUST be from the standardized list: Performance, Developer Experience, Pricing, Documentation, Reliability, Support, Security, Ease of Use, Scalability, Community, AI Features, Vendor Lock-in>",
      "score": <0-100>,
      "sentiment": "positive" | "mixed" | "negative",
      "evidence": ["<paraphrased finding 1>", "<paraphrased finding 2>"],
      "sampleSize": <number of posts mentioning this>
    }
  ],
  "competitors": ${competitors?.length ? `[
    {
      "product": "<competitor name>",
      "overallScore": <0-100>,
      "strengthVs": ["<where competitor wins>"],
      "weaknessVs": ["<where competitor loses>"],
      "dimensions": {"<dimension from same standardized list>": <score>, ...}
    }
  ]` : "null"}
}

Rules:
- Include 4-8 dimensions from the standardized list
- Only include a dimension if the data actually discusses it
- confidence should reflect: 0.0-0.3 = very little data, 0.3-0.6 = moderate data, 0.6-0.8 = good data, 0.8-1.0 = excellent data
- Each evidence string should be a concise paraphrase, not a direct quote
- For competitors, use the SAME dimension names as the main product so scores are directly comparable`;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for LLM analysis");
  }

  const response = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data.content
    .map((block: any) => block.text || "")
    .join("")
    .trim();

  // Parse JSON, stripping any markdown fences
  const cleanJson = text.replace(/```json\s*|```\s*/g, "").trim();
  const analysis: LLMAnalysisOutput = JSON.parse(cleanJson);

  // Build source summaries from raw data
  const sourceSummaries = buildSourceSummaries(posts);

  // Assemble the full report
  const report: ReputationReport = {
    product,
    overallScore: analysis.overallScore,
    overallSentiment: analysis.overallSentiment,
    confidence: analysis.confidence,
    dimensions: analysis.dimensions,
    sources: sourceSummaries,
    competitors: analysis.competitors || undefined,
    generatedAt: new Date().toISOString(),
    dataWindow: `Last ${posts.length > 0 ? inferTimeWindow(posts) : "N/A"}`,
    totalDataPoints: posts.length,
  };

  return report;
}

function buildSourceSummaries(posts: RawPost[]): SourceSummary[] {
  const bySource = new Map<string, RawPost[]>();
  for (const p of posts) {
    const arr = bySource.get(p.source) || [];
    arr.push(p);
    bySource.set(p.source, arr);
  }

  const summaries: SourceSummary[] = [];
  for (const [source, sourcePosts] of bySource) {
    const avgScore =
      sourcePosts.reduce((sum, p) => sum + p.score, 0) / sourcePosts.length;
    // Normalize score to -1..1 range (rough heuristic)
    const normalizedSentiment = Math.max(
      -1,
      Math.min(1, avgScore > 10 ? 0.3 : avgScore > 0 ? 0.1 : -0.2)
    );

    summaries.push({
      source: source as "reddit" | "hn" | "youtube",
      postsAnalyzed: sourcePosts.length,
      avgSentiment: normalizedSentiment,
      topThemes: [], // Will be enriched by LLM in future versions
      notableInsights: [],
    });
  }

  return summaries;
}

function inferTimeWindow(posts: RawPost[]): string {
  const dates = posts
    .map((p) => new Date(p.createdAt).getTime())
    .filter((d) => !isNaN(d));

  if (dates.length === 0) return "unknown";

  const oldest = Math.min(...dates);
  const newest = Math.max(...dates);
  const daySpan = Math.round((newest - oldest) / 86400000);

  if (daySpan <= 7) return "7 days";
  if (daySpan <= 30) return "30 days";
  if (daySpan <= 90) return "3 months";
  if (daySpan <= 365) return "1 year";
  return `${Math.round(daySpan / 365)} years`;
}

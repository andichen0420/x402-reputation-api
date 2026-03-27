// ============================================
// x402 Product Reputation API - Type Definitions
// ============================================

export interface ReputationRequest {
  product: string;
  competitors?: string[];
  timeRange?: "7d" | "30d" | "90d" | "1y" | "all";
  sources?: ("reddit" | "hn" | "youtube" | "amazon")[];
}

export interface DimensionScore {
  dimension: string;
  score: number;        // 0-100
  sentiment: "positive" | "mixed" | "negative";
  evidence: string[];   // key quotes/paraphrased evidence
  sampleSize: number;
}

export interface SourceSummary {
  source: "reddit" | "hn" | "youtube" | "amazon";
  postsAnalyzed: number;
  avgSentiment: number; // -1 to 1
  topThemes: string[];
  notableInsights: string[];
}

export interface CompetitorComparison {
  product: string;
  overallScore: number;
  strengthVs: string[];     // where this product wins
  weaknessVs: string[];     // where this product loses
  dimensions: Record<string, number>;
}

export interface ReputationReport {
  product: string;
  overallScore: number;           // 0-100
  overallSentiment: "positive" | "mixed" | "negative";
  confidence: number;             // 0-1, based on data volume
  dimensions: DimensionScore[];
  sources: SourceSummary[];
  competitors?: CompetitorComparison[];
  generatedAt: string;
  dataWindow: string;
  totalDataPoints: number;
}

// Raw data from sources
export interface RawPost {
  source: "reddit" | "hn" | "youtube" | "amazon";
  title: string;
  body: string;
  author: string;
  score: number;
  url: string;
  createdAt: string;
  commentCount?: number;
}

// HN Algolia response types
export interface HNSearchResult {
  hits: HNHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
}

export interface HNHit {
  objectID: string;
  title?: string;
  url?: string;
  author: string;
  points?: number;
  num_comments?: number;
  created_at: string;
  created_at_i: number;
  story_text?: string;
  comment_text?: string;
  story_title?: string;
  story_url?: string;
  _tags: string[];
}

// Reddit types
export interface RedditListing {
  kind: string;
  data: {
    children: RedditPost[];
    after: string | null;
  };
}

export interface RedditPost {
  kind: string;
  data: {
    title: string;
    selftext: string;
    author: string;
    score: number;
    url: string;
    permalink: string;
    created_utc: number;
    num_comments: number;
    subreddit: string;
  };
}

// YouTube transcript types
export interface YouTubeTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
}

// LLM analysis types
export interface LLMAnalysisInput {
  product: string;
  posts: RawPost[];
  competitors?: string[];
}

export interface LLMAnalysisOutput {
  overallScore: number;
  overallSentiment: "positive" | "mixed" | "negative";
  confidence: number;
  dimensions: DimensionScore[];
  competitors?: CompetitorComparison[];
}

// ============================================
// Smart Query Builder + Relevance Filter + Cache
// ============================================

import type { RawPost } from "../types.js";

// ─── Query Builder ──────────────────────────
// Disambiguates generic product names by adding category context

const CATEGORY_QUALIFIERS: Record<string, string[]> = {
  default: ["software", "app", "tool"],
  saas: ["SaaS", "platform", "software"],
  devtools: ["IDE", "developer tool", "coding", "programming"],
  ai: ["AI", "machine learning", "model", "LLM"],
  crypto: ["crypto", "blockchain", "web3", "protocol"],
  hardware: ["device", "hardware", "gadget"],
  fintech: ["fintech", "payment", "banking"],
};

// Products that are known to be ambiguous single words
const DISAMBIGUATION: Record<string, string> = {
  cursor: "Cursor AI IDE",
  arc: "Arc browser",
  notion: "Notion app",
  linear: "Linear issue tracker",
  ray: "Ray.so",
  base: "Coinbase Base L2",
  rust: "Rust programming language",
  go: "Go programming language",
  swift: "Swift programming language",
  charm: "Charm CLI tools",
  fly: "Fly.io",
  render: "Render cloud hosting",
  railway: "Railway deployment",
  deno: "Deno runtime",
  bun: "Bun JavaScript runtime",
  warp: "Warp terminal",
  fig: "Fig terminal",
  mint: "Linux Mint",
  spark: "Apache Spark",
  kong: "Kong API gateway",
};

/**
 * Build a smarter search query that adds context to avoid false positives.
 * "Cursor" → "Cursor AI IDE"
 * "Supabase" → "Supabase" (already specific enough)
 */
export function buildSearchQuery(
  product: string,
  category: string = "default"
): string {
  const lower = product.toLowerCase().trim();

  // Check disambiguation map first
  if (DISAMBIGUATION[lower]) {
    return DISAMBIGUATION[lower];
  }

  // If the product name is short (≤6 chars) or a single common word,
  // add category qualifier to disambiguate
  if (product.length <= 6 && !product.includes(" ")) {
    const qualifiers = CATEGORY_QUALIFIERS[category] || CATEGORY_QUALIFIERS.default;
    return `${product} ${qualifiers[0]}`;
  }

  // Already specific enough
  return product;
}

/**
 * Build multiple query variants for broader coverage.
 * Returns the primary query + an optional review-focused query.
 */
export function buildQueryVariants(
  product: string,
  category: string = "default"
): string[] {
  const primary = buildSearchQuery(product, category);
  const queries = [primary];

  // Add a review-focused variant for Reddit
  if (!primary.includes("review")) {
    queries.push(`${product} review`);
  }

  return queries;
}

// ─── Relevance Filter ───────────────────────
// Post-search filter to remove clearly irrelevant results

/**
 * Checks if a post is likely relevant to the product.
 * Uses simple heuristics — not perfect, but catches the worst noise.
 */
export function isRelevantPost(post: RawPost, product: string): boolean {
  // Amazon reviews are fetched by ASIN search, already highly relevant
  if ((post as any).source === "amazon") return true;

  const productLower = product.toLowerCase();
  const titleLower = post.title.toLowerCase();
  const bodyLower = post.body.toLowerCase();
  const combined = `${titleLower} ${bodyLower}`;

  // The product name (or a substantial part) must appear in title or body
  const productWords = productLower.split(/\s+/);
  const primaryWord = productWords[0]; // e.g., "cursor" from "Cursor AI IDE"

  // Check if the primary product word appears
  if (!combined.includes(primaryWord)) {
    return false;
  }

  // For ambiguous single-word products, apply stricter checks
  if (DISAMBIGUATION[primaryWord]) {
    const disambigTerms = DISAMBIGUATION[primaryWord].toLowerCase().split(/\s+/);
    // At least one qualifying term must also appear (e.g., "AI", "IDE", "browser")
    const qualifyingTerms = disambigTerms.filter((t) => t !== primaryWord);
    const hasQualifier = qualifyingTerms.some((term) => combined.includes(term));

    // Amazon reviews are already product-specific, always relevant
    if ((post as any).source === "amazon") return true;

    // Or the post is from a tech/programming subreddit (good signal)
    const techSignals = [
      "programming", "coding", "developer", "software", "tech",
      "code", "editor", "vscode", "vim", "emacs", "neovim",
      "github", "api", "deploy", "startup", "saas",
    ];
    const hasTechContext = techSignals.some((s) => combined.includes(s));

    if (!hasQualifier && !hasTechContext) {
      return false;
    }
  }

  return true;
}

/**
 * Filter a batch of posts for relevance.
 * Returns only posts that pass the relevance check.
 */
export function filterRelevantPosts(
  posts: RawPost[],
  product: string
): RawPost[] {
  const before = posts.length;
  const filtered = posts.filter((p) => isRelevantPost(p, product));
  const removed = before - filtered.length;

  if (removed > 0) {
    console.log(
      `[Filter] Removed ${removed}/${before} irrelevant posts for "${product}"`
    );
  }

  return filtered;
}

// ─── TTL Cache ──────────────────────────────
// Simple in-memory cache with configurable TTL

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMinutes: number = 15) {
    this.ttlMs = ttlMinutes * 60 * 1000;

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Build a cache key from request parameters
   */
  static buildKey(params: Record<string, any>): string {
    return JSON.stringify(params, Object.keys(params).sort());
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache] HIT for key: ${key.slice(0, 60)}...`);
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.ttlMs,
    });
    console.log(
      `[Cache] SET key: ${key.slice(0, 60)}... (expires in ${this.ttlMs / 60000}min)`
    );
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[Cache] Cleaned ${cleaned} expired entries`);
    }
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

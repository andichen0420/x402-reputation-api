// ============================================
// Reddit Data Source
// Uses public JSON API (append .json to URLs)
// For higher rate limits, configure OAuth in .env
// ============================================

import type { RawPost, RedditListing } from "../types.js";
import { buildSearchQuery, buildQueryVariants, filterRelevantPosts } from "../utils/search-helpers.js";

const REDDIT_BASE = "https://www.reddit.com";
const USER_AGENT = "x402-reputation-api/1.0 (product reputation analysis)";

// Subreddits known for product discussions per category
const PRODUCT_SUBREDDITS: Record<string, string[]> = {
  default: ["technology", "programming", "software", "startups"],
  saas: ["SaaS", "startups", "Entrepreneur", "smallbusiness"],
  devtools: ["programming", "webdev", "devops", "selfhosted", "node", "reactjs"],
  ai: ["MachineLearning", "artificial", "LocalLLaMA", "ChatGPT", "singularity"],
  crypto: ["CryptoCurrency", "ethereum", "defi", "web3"],
  hardware: ["hardware", "buildapc", "gadgets", "tech"],
  fintech: ["fintech", "personalfinance", "investing"],
};

async function redditFetch(url: string, retries: number = 0): Promise<any> {
  const MAX_RETRIES = 3;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };

  // Rate limit: Reddit allows ~60 req/min for unauthenticated
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) }).catch(() => null);

  if (!res) {
    console.warn(`[Reddit] Request timeout for ${url}`);
    return null;
  }

  if (res.status === 429) {
    if (retries >= MAX_RETRIES) {
      console.warn(`[Reddit] Max retries (${MAX_RETRIES}) reached, skipping`);
      return null;
    }
    const retryAfter = parseInt(res.headers.get("retry-after") || "5");
    console.log(`[Reddit] Rate limited, waiting ${retryAfter}s... (retry ${retries + 1}/${MAX_RETRIES})`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return redditFetch(url, retries + 1);
  }

  if (!res.ok) {
    console.warn(`[Reddit] HTTP ${res.status} for ${url}`);
    return null;
  }

  return res.json();
}

export async function searchReddit(
  product: string,
  timeRange: string = "90d",
  category: string = "default"
): Promise<RawPost[]> {
  const posts: RawPost[] = [];
  const timeMap: Record<string, string> = {
    "7d": "week",
    "30d": "month",
    "90d": "year",
    "1y": "year",
    "all": "all",
  };
  const t = timeMap[timeRange] || "year";

  // Use smart query builder to disambiguate generic product names
  const smartQuery = buildSearchQuery(product, category);
  console.log(`[Reddit] Smart query: "${smartQuery}" (original: "${product}")`);

  // 1. Global search across Reddit with smart query
  const searchUrl = `${REDDIT_BASE}/search.json?q=${encodeURIComponent(smartQuery)}&sort=relevance&t=${t}&limit=50&type=link`;
  const searchData: RedditListing | null = await redditFetch(searchUrl);

  if (searchData?.data?.children) {
    for (const child of searchData.data.children) {
      const d = child.data;
      posts.push({
        source: "reddit",
        title: d.title,
        body: d.selftext?.slice(0, 2000) || "",
        author: d.author,
        score: d.score,
        url: `https://reddit.com${d.permalink}`,
        createdAt: new Date(d.created_utc * 1000).toISOString(),
        commentCount: d.num_comments,
      });
    }
  }

  // 2. Search in relevant subreddits for deeper signal
  const subreddits = PRODUCT_SUBREDDITS[category] || PRODUCT_SUBREDDITS.default;
  for (const sub of subreddits.slice(0, 3)) {
    // limit to 3 to stay within rate limits
    const subUrl = `${REDDIT_BASE}/r/${sub}/search.json?q=${encodeURIComponent(smartQuery)}&restrict_sr=on&sort=relevance&t=${t}&limit=25`;
    const subData: RedditListing | null = await redditFetch(subUrl);

    if (subData?.data?.children) {
      for (const child of subData.data.children) {
        const d = child.data;
        posts.push({
          source: "reddit",
          title: `[r/${d.subreddit}] ${d.title}`,
          body: d.selftext?.slice(0, 2000) || "",
          author: d.author,
          score: d.score,
          url: `https://reddit.com${d.permalink}`,
          createdAt: new Date(d.created_utc * 1000).toISOString(),
          commentCount: d.num_comments,
        });
      }
    }

    // Polite delay between subreddit requests
    await new Promise((r) => setTimeout(r, 1200));
  }

  // 3. Fetch top comments from highest-scored posts (the real gold)
  const topPosts = posts
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const post of topPosts) {
    try {
      const commentsUrl = `${post.url}.json?limit=10&depth=1&sort=top`;
      const commentsData = await redditFetch(commentsUrl);

      if (Array.isArray(commentsData) && commentsData[1]?.data?.children) {
        for (const comment of commentsData[1].data.children) {
          if (comment.kind === "t1" && comment.data.body) {
            posts.push({
              source: "reddit",
              title: post.title,
              body: comment.data.body.slice(0, 1500),
              author: comment.data.author,
              score: comment.data.score || 0,
              url: post.url,
              createdAt: new Date(comment.data.created_utc * 1000).toISOString(),
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[Reddit] Failed to fetch comments for ${post.url}`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log(`[Reddit] Found ${posts.length} posts for "${product}"`);
  const deduped = deduplicateByUrl(posts);
  return filterRelevantPosts(deduped, product);
}

function deduplicateByUrl(posts: RawPost[]): RawPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    const key = `${p.url}::${p.body.slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

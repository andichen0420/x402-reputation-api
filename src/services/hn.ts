// ============================================
// Hacker News (Algolia API) Data Source
// No auth required. 10,000 req/hr rate limit.
// ============================================

import type { RawPost, HNSearchResult } from "../types.js";
import { buildSearchQuery, filterRelevantPosts } from "../utils/search-helpers.js";

const HN_API = "https://hn.algolia.com/api/v1";

function timeRangeToTimestamp(range: string): number {
  const now = Math.floor(Date.now() / 1000);
  const durations: Record<string, number> = {
    "7d": 7 * 86400,
    "30d": 30 * 86400,
    "90d": 90 * 86400,
    "1y": 365 * 86400,
    "all": 10 * 365 * 86400,
  };
  return now - (durations[range] || durations["90d"]);
}

export async function searchHN(
  product: string,
  timeRange: string = "90d",
  category: string = "default"
): Promise<RawPost[]> {
  const since = timeRangeToTimestamp(timeRange);
  const posts: RawPost[] = [];

  // Use smart query builder to disambiguate generic product names
  const smartQuery = buildSearchQuery(product, category);
  console.log(`[HN] Smart query: "${smartQuery}" (original: "${product}")`);

  // 1. Search stories (titles + URLs)
  const storyUrl = `${HN_API}/search?query=${encodeURIComponent(smartQuery)}&tags=story&numericFilters=created_at_i>${since}&hitsPerPage=50`;
  const storyRes = await fetch(storyUrl);
  const storyData: HNSearchResult = await storyRes.json();

  for (const hit of storyData.hits) {
    posts.push({
      source: "hn",
      title: hit.title || "",
      body: hit.story_text || "",
      author: hit.author,
      score: hit.points || 0,
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      createdAt: hit.created_at,
      commentCount: hit.num_comments,
    });
  }

  // 2. Search comments (deeper signal — people's actual opinions)
  const commentUrl = `${HN_API}/search?query=${encodeURIComponent(smartQuery)}&tags=comment&numericFilters=created_at_i>${since},points>1&hitsPerPage=100`;
  const commentRes = await fetch(commentUrl);
  const commentData: HNSearchResult = await commentRes.json();

  for (const hit of commentData.hits) {
    // Strip HTML from comment_text
    const cleanText = (hit.comment_text || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanText.length > 30) {
      posts.push({
        source: "hn",
        title: hit.story_title || "",
        body: cleanText,
        author: hit.author,
        score: hit.points || 0,
        url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        createdAt: hit.created_at,
      });
    }
  }

  // 3. Also search Show HN and Ask HN for more product-specific discussion
  const showUrl = `${HN_API}/search?query=${encodeURIComponent(smartQuery)}&tags=(show_hn,ask_hn)&numericFilters=created_at_i>${since}&hitsPerPage=20`;
  const showRes = await fetch(showUrl);
  const showData: HNSearchResult = await showRes.json();

  for (const hit of showData.hits) {
    const body = (hit.story_text || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    posts.push({
      source: "hn",
      title: hit.title || "",
      body,
      author: hit.author,
      score: hit.points || 0,
      url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      createdAt: hit.created_at,
      commentCount: hit.num_comments,
    });
  }

  console.log(`[HN] Found ${posts.length} posts for "${product}"`);
  const deduped = deduplicateByUrl(posts);
  return filterRelevantPosts(deduped, product);
}

function deduplicateByUrl(posts: RawPost[]): RawPost[] {
  const seen = new Set<string>();
  return posts.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}

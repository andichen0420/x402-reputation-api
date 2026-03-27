// ============================================
// Amazon Reviews Data Source (Rainforest API)
// Uses product endpoint → product.top_reviews
// Requires RAINFOREST_API_KEY in .env
// Pricing: ~$0.01 per request
// ============================================

import type { RawPost } from "../types.js";
import { buildSearchQuery, filterRelevantPosts } from "../utils/search-helpers.js";

const RAINFOREST_API = "https://api.rainforestapi.com/request";
const API_KEY = process.env.RAINFOREST_API_KEY || "";

interface RainforestTopReview {
  id: string;
  title: string;
  body: string;
  rating: number;
  date: { raw: string };
  profile: { name: string };
  helpful_votes: number | null;
  verified_purchase: boolean;
  link: string;
}

interface RainforestSearchResult {
  title: string;
  asin: string;
  rating?: number;
  ratings_total?: number;
  link: string;
}

/**
 * Search Amazon for a product and return reviews as RawPost[]
 */
export async function searchAmazon(
  product: string,
  timeRange: string = "90d",
  category: string = "default"
): Promise<RawPost[]> {
  if (!API_KEY) {
    console.log("[Amazon] No RAINFOREST_API_KEY set, skipping");
    return [];
  }

  const posts: RawPost[] = [];

  try {
    // Step 1: Search for the product to get ASINs
    const searchQuery = buildSearchQuery(product, category);
    console.log(`[Amazon] Searching for: "${searchQuery}"`);

    const searchUrl = new URL(RAINFOREST_API);
    searchUrl.searchParams.set("api_key", API_KEY);
    searchUrl.searchParams.set("type", "search");
    searchUrl.searchParams.set("amazon_domain", "amazon.com");
    searchUrl.searchParams.set("search_term", searchQuery);
    searchUrl.searchParams.set("output", "json");

    const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(30000) });
    if (!searchRes.ok) {
      console.log(`[Amazon] Search failed: ${searchRes.status}`);
      return [];
    }

    const searchData = await searchRes.json();
    const results: RainforestSearchResult[] = searchData.search_results || [];

    if (results.length === 0) {
      console.log("[Amazon] No products found");
      return [];
    }

    // Take top 2 most reviewed products (to save API credits)
    const topProducts = results
      .filter((r) => r.asin && r.ratings_total && r.ratings_total > 10)
      .sort((a, b) => (b.ratings_total || 0) - (a.ratings_total || 0))
      .slice(0, 2);

    if (topProducts.length === 0) {
      if (results[0]?.asin) {
        topProducts.push(results[0]);
      } else {
        console.log("[Amazon] No products with ASIN found");
        return [];
      }
    }

    console.log(`[Amazon] Found ${topProducts.length} products, fetching product pages...`);

    // Step 2: Fetch product pages (includes top_reviews) in parallel
    const productPromises = topProducts.map((p) =>
      fetchProductReviews(p.asin, p.title)
    );

    const productResults = await Promise.allSettled(productPromises);
    for (const result of productResults) {
      if (result.status === "fulfilled") {
        posts.push(...result.value);
      }
    }

    // Filter for relevance
    const filtered = filterRelevantPosts(posts, product);
    console.log(`[Amazon] Total: ${posts.length} reviews, filtered: ${filtered.length}`);
    return filtered.length > 0 ? filtered : posts.slice(0, 20);
  } catch (err: any) {
    console.error(`[Amazon] Error: ${err.message}`);
    return [];
  }
}

/**
 * Fetch product page and extract top_reviews
 */
async function fetchProductReviews(
  asin: string,
  productTitle: string
): Promise<RawPost[]> {
  const posts: RawPost[] = [];

  try {
    const productUrl = new URL(RAINFOREST_API);
    productUrl.searchParams.set("api_key", API_KEY);
    productUrl.searchParams.set("type", "product");
    productUrl.searchParams.set("amazon_domain", "amazon.com");
    productUrl.searchParams.set("asin", asin);
    productUrl.searchParams.set("output", "json");

    const res = await fetch(productUrl.toString(), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.log(`[Amazon] Product fetch failed for ${asin}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const product = data.product || {};
    const reviews: RainforestTopReview[] = product.top_reviews || [];

    console.log(`[Amazon] ${asin} (${productTitle}): ${reviews.length} top reviews, rating: ${product.rating}/5, ${product.ratings_total} total ratings`);

    // Add product summary as a "review" for context
    if (product.rating && product.ratings_total) {
      const bullets = product.feature_bullets_flat || "";
      posts.push({
        source: "amazon" as any,
        title: `[${product.rating}/5⭐ from ${product.ratings_total} ratings] ${productTitle}`,
        body: `Amazon product with ${product.ratings_total} total ratings. Overall rating: ${product.rating}/5. ${bullets ? "Key features: " + bullets : ""}`,
        author: "Amazon Product Page",
        score: Math.round(product.rating * 20),
        url: product.link || `https://www.amazon.com/dp/${asin}`,
        createdAt: new Date().toISOString(),
        commentCount: product.ratings_total,
      });
    }

    // Add individual reviews
    for (const review of reviews) {
      // Parse date from "Reviewed in the United States on March 4, 2026"
      let createdAt = new Date().toISOString();
      try {
        const dateMatch = review.date?.raw?.match(/on\s+(.+)$/);
        if (dateMatch) {
          const parsed = new Date(dateMatch[1]);
          if (!isNaN(parsed.getTime())) {
            createdAt = parsed.toISOString();
          }
        }
      } catch {}

      posts.push({
        source: "amazon" as any,
        title: `[${review.rating}/5⭐] ${review.title || "Amazon Review"}`,
        body: review.body || "",
        author: review.profile?.name || "Amazon Customer",
        score: review.helpful_votes || Math.round(review.rating * 2),
        url: review.link || `https://www.amazon.com/dp/${asin}`,
        createdAt,
        commentCount: 0,
      });
    }
  } catch (err: any) {
    console.error(`[Amazon] Product fetch error for ${asin}: ${err.message}`);
  }

  return posts;
}

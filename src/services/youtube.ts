import type { RawPost } from "../types.js";

const YT_API = "https://www.googleapis.com/youtube/v3";

export async function searchYouTube(
  product: string,
  timeRange: string = "90d"
): Promise<RawPost[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log("[YouTube] No API key, skipping");
    return [];
  }

  const posts: RawPost[] = [];

  try {
    const days: Record<string, number> = {
      "7d": 7, "30d": 30, "90d": 90, "1y": 365, "all": 3650,
    };
    const since = new Date(Date.now() - (days[timeRange] || 90) * 86400000).toISOString();

    const searchUrl = `${YT_API}/search?part=snippet&q=${encodeURIComponent(
      product + " review"
    )}&type=video&order=relevance&maxResults=10&publishedAfter=${since}&key=${apiKey}`;

    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });

    if (!searchRes.ok) {
      const err = await searchRes.text();
      console.warn("[YouTube] Search API error " + searchRes.status + ": " + err.slice(0, 200));
      return [];
    }

    const searchData = await searchRes.json();
    const videos = searchData.items || [];
    console.log("[YouTube] Found " + videos.length + " videos for " + product);

    for (const video of videos.slice(0, 5)) {
      const videoId = video.id?.videoId;
      if (!videoId) continue;
      const snippet = video.snippet || {};
      const transcript = await getTranscriptDirect(videoId);

      if (transcript && transcript.length > 100) {
        posts.push({
          source: "youtube",
          title: snippet.title || "",
          body: transcript.slice(0, 3000),
          author: snippet.channelTitle || "",
          score: 0,
          url: "https://youtube.com/watch?v=" + videoId,
          createdAt: snippet.publishedAt || new Date().toISOString(),
        });
      } else if (snippet.description && snippet.description.length > 50) {
        posts.push({
          source: "youtube",
          title: snippet.title || "",
          body: snippet.description.slice(0, 1000),
          author: snippet.channelTitle || "",
          score: 0,
          url: "https://youtube.com/watch?v=" + videoId,
          createdAt: snippet.publishedAt || new Date().toISOString(),
        });
      }

      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    console.error("[YouTube] Search failed:", e);
  }

  console.log("[YouTube] Returning " + posts.length + " posts for " + product);
  return posts;
}

async function getTranscriptDirect(videoId: string): Promise<string | null> {
  try {
    const pageRes = await fetch("https://www.youtube.com/watch?v=" + videoId, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; x402-reputation-api/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) return null;

    const tracks = JSON.parse(captionMatch[1]);
    const englishTrack = tracks.find(
      (t: any) => t.languageCode === "en" || t.languageCode?.startsWith("en")
    ) || tracks.find((t: any) => t.kind === "asr");

    if (!englishTrack?.baseUrl) return null;

    const captionRes = await fetch(englishTrack.baseUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!captionRes.ok) return null;

    const xml = await captionRes.text();
    const text = xml
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    return text || null;
  } catch (e) {
    return null;
  }
}

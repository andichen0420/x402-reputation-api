import 'dotenv/config';

async function main() {
  const key = process.env.RAINFOREST_API_KEY;
  const url = `https://api.rainforestapi.com/request?api_key=${key}&type=product&amazon_domain=amazon.com&asin=B0D1XD1ZV3&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data = await res.json();
  const p = data.product || {};
  console.log('Title:', p.title);
  console.log('Rating:', p.rating);
  console.log('Ratings total:', p.ratings_total);
  console.log('Top keys:', Object.keys(data).join(', '));
  console.log('Product keys:', Object.keys(p).join(', '));
  if (data.top_reviews) console.log('top_reviews:', data.top_reviews.length);
  if (data.reviews) console.log('reviews:', data.reviews.length);
  if (p.top_reviews) console.log('p.top_reviews:', p.top_reviews.length);
  if (p.reviews) console.log('p.reviews:', p.reviews.length);
  // Check for any review-like field
  for (const key of Object.keys(data)) {
    if (key.toLowerCase().includes('review')) {
      console.log(`Found review field: ${key}`, typeof data[key], Array.isArray(data[key]) ? data[key].length : '');
    }
  }
}
main();

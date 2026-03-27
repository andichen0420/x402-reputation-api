import 'dotenv/config';

async function main() {
  const key = process.env.RAINFOREST_API_KEY;
  const url = `https://api.rainforestapi.com/request?api_key=${key}&type=product&amazon_domain=amazon.com&asin=B0D1XD1ZV3&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data = await res.json();
  console.log('Reviews:', JSON.stringify(data.product.top_reviews.slice(0, 2), null, 2));
}
main();

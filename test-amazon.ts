import 'dotenv/config';
import { searchAmazon } from './src/services/amazon.js';

async function main() {
  const results = await searchAmazon('AirPods Pro', '90d');
  console.log('Found:', results.length, 'reviews');
  if (results.length > 0) {
    console.log('Sample:', JSON.stringify(results[0], null, 2));
  }
}
main();

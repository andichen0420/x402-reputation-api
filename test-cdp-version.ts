import 'dotenv/config';
import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient } from '@x402/core/server';

async function main() {
  const config = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET);
  const client = new HTTPFacilitatorClient(config);
  const supported = await client.getSupported();
  console.log('CDP supported versions:');
  for (const kind of supported.kinds) {
    console.log(`  x402Version: ${kind.x402Version}, scheme: ${kind.scheme}, network: ${kind.network}`);
  }
}
main();

import 'dotenv/config';
import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient } from '@x402/core/server';

async function main() {
  console.log('Key ID:', process.env.CDP_API_KEY_ID?.slice(0, 20));
  console.log('Secret starts with:', process.env.CDP_API_KEY_SECRET?.slice(0, 30));
  console.log('Secret length:', process.env.CDP_API_KEY_SECRET?.length);

  const secret = (process.env.CDP_API_KEY_SECRET || "").replace(/\\n/g, "\n");
  console.log('Secret after replace starts with:', secret.slice(0, 30));

  try {
    const config = createFacilitatorConfig(process.env.CDP_API_KEY_ID, secret);
    const client = new HTTPFacilitatorClient(config);
    const supported = await client.getSupported();
    console.log('SUCCESS! Supported:', JSON.stringify(supported).slice(0, 200));
  } catch (err: any) {
    console.error('FAILED:', err.message);
  }
}
main();

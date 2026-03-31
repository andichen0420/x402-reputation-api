import { config } from 'dotenv';
config({ path: '/Users/andichen/Downloads/reputation-mcp-server/.env' });
config();

import { privateKeyToAccount } from 'viem/accounts';
import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';

async function main() {
  const raw = await fetch('https://x402-reputation-api-production.up.railway.app/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'testxyz2' }),
  });
  const header = raw.headers.get('payment-required');
  if (!header) { console.log('No payment-required header'); return; }
  const paymentRequired = JSON.parse(Buffer.from(header, 'base64').toString());
  console.log('x402Version:', paymentRequired.x402Version);
  console.log('Network:', paymentRequired.accepts[0].network);

  const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: base, transport: http() });
  const publicClient = createPublicClient({ chain: base, transport: http() });
  const signer = toClientEvmSigner({ ...walletClient, address: account.address }, publicClient);
  const scheme = new ExactEvmScheme(signer);

  const payload = await scheme.createPayload(paymentRequired.accepts[0]);
  console.log('\nPayload x402Version:', payload.x402Version);
  console.log('Payload scheme:', payload.scheme);
  console.log('Payload network:', payload.network);

  const { createFacilitatorConfig } = await import('@coinbase/x402');
  const { HTTPFacilitatorClient } = await import('@x402/core/server');
  const cdpConfig = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET);
  const facilitator = new HTTPFacilitatorClient(cdpConfig);

  try {
    const result = await facilitator.verify(payload, paymentRequired.accepts[0]);
    console.log('\nVerify result:', JSON.stringify(result));
  } catch (err: any) {
    console.error('\nVerify error:', err.message);
    if (err.cause) console.error('Cause:', err.cause);
  }
}
main();

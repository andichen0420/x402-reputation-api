import { config } from 'dotenv';
config({ path: '/Users/andichen/Downloads/reputation-mcp-server/.env' });
config();

async function main() {
  let requestCount = 0;
  const interceptFetch: typeof fetch = async (input, init) => {
    requestCount++;
    const h = new Headers(init?.headers);
    console.log('--- Request ' + requestCount + ' ---');
    console.log('URL:', typeof input === 'string' ? input : (input as Request).url);
    for (const [k, v] of h.entries()) {
      console.log('  ' + k + ': ' + v.slice(0, 80));
    }
    return fetch(input, init);
  };

  const { x402Client, wrapFetchWithPayment } = await import('@x402/fetch');
  const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
  const { privateKeyToAccount } = await import('viem/accounts');

  const signer = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  const payFetch = wrapFetchWithPayment(interceptFetch, client);

  const res = await payFetch('https://x402-reputation-api-production.up.railway.app/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'headertest1' }),
  });

  console.log('\n--- Final response ---');
  console.log('Status:', res.status);
  for (const [k, v] of res.headers.entries()) {
    if (k.includes('payment') || k.includes('x-')) {
      console.log('  ' + k + ': ' + v.slice(0, 80));
    }
  }
}
main().catch(e => console.error('Fatal:', e.message));

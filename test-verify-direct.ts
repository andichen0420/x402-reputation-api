import { config } from 'dotenv';
config({ path: '/Users/andichen/Downloads/reputation-mcp-server/.env' });
config();

async function main() {
  const raw = await fetch('https://x402-reputation-api-production.up.railway.app/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'directtest3' }),
  });
  const prHeader = raw.headers.get('payment-required');
  console.log('Got payment-required header:', !!prHeader);

  let paymentSignature = '';
  let requestCount = 0;
  const interceptFetch: typeof fetch = async (input, init) => {
    requestCount++;
    const h = new Headers(init?.headers);
    const ps = h.get('payment-signature');
    if (ps) {
      paymentSignature = ps;
      console.log('Request ' + requestCount + ': has payment-signature, length=' + ps.length);
    } else {
      console.log('Request ' + requestCount + ': no payment-signature');
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

  await payFetch('https://x402-reputation-api-production.up.railway.app/monitor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: 'directtest3' }),
  });

  if (!paymentSignature) {
    console.log('No payment signature created');
    return;
  }

  const decoded = JSON.parse(Buffer.from(paymentSignature, 'base64').toString());
  console.log('\nPayload x402Version:', decoded.x402Version);
  console.log('Payload scheme:', decoded.scheme);
  console.log('Payload network:', decoded.network);
  console.log('Payload keys:', Object.keys(decoded.payload || {}));
  console.log('\nFull payload:');
  console.log(JSON.stringify(decoded, null, 2));

  const paymentRequired = JSON.parse(Buffer.from(prHeader!, 'base64').toString());
  const requirements = paymentRequired.accepts[0];
  console.log('\nRequirements:');
  console.log(JSON.stringify(requirements, null, 2));
}
main().catch(e => console.error('Fatal:', e.message));

import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const f = wrapFetchWithPayment(fetch, client);

async function main() {
  console.log("Testing LIVE endpoint...");
  const r = await f("https://x402-reputation-api-production.up.railway.app/monitor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: "Cursor", sources: ["reddit", "hn"] }),
  });
  console.log("Status:", r.status);
  console.log(JSON.stringify(await r.json(), null, 2));
}

main().catch(console.error);

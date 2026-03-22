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
  console.log("Testing YouTube source only...\n");
  const r = await f("http://localhost:4021/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: "Supabase", sources: ["youtube"], category: "devtools" }),
  });
  console.log(JSON.stringify(await r.json(), null, 2));
}

main().catch(console.error);

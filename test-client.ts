import "dotenv/config";
// ============================================
// x402 Buyer Client — Test Script
//
// Usage:
//   EVM_PRIVATE_KEY=0x... tsx test-client.ts
//
// Requires USDC on Base Sepolia.
// Get testnet USDC: https://faucet.circle.com/
// ============================================

import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const SERVER = process.env.SERVER_URL || "http://localhost:4021";
const PRIVATE_KEY = process.env.EVM_PRIVATE_KEY as `0x${string}`;

if (!PRIVATE_KEY) {
  console.error("❌ Set EVM_PRIVATE_KEY env var (with 0x prefix)");
  process.exit(1);
}

// Setup x402 client
const signer = privateKeyToAccount(PRIVATE_KEY);
const client = new x402Client();
registerExactEvmScheme(client, { signer });
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

async function main() {
  console.log(`\n🔍 Testing x402 Product Reputation API at ${SERVER}\n`);

  // ── Test 1: Health check (free) ────────────
  console.log("━━━ 1. Health Check (free) ━━━");
  const health = await fetch(`${SERVER}/health`);
  console.log(await health.json());

  // ── Test 2: Monitor (cheapest - $0.03) ─────
  console.log("\n━━━ 2. Monitor Pulse ($0.03 USDC) ━━━");
  const monitorRes = await fetchWithPayment(`${SERVER}/monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product: "Cursor",
      sources: ["reddit", "hn"],
    }),
  });
  const monitorData = await monitorRes.json();
  console.log(JSON.stringify(monitorData, null, 2));

  // ── Test 3: Full Analysis ($0.05) ──────────
  console.log("\n━━━ 3. Full Analysis ($0.05 USDC) ━━━");
  const analyzeRes = await fetchWithPayment(`${SERVER}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      product: "Supabase",
      competitors: ["Firebase", "PlanetScale"],
      timeRange: "90d",
      sources: ["reddit", "hn"],
      category: "devtools",
    }),
  });
  const analyzeData = await analyzeRes.json();
  console.log(JSON.stringify(analyzeData, null, 2));

  // ── Test 4: Comparison ($0.08) ─────────────
  console.log("\n━━━ 4. Comparison ($0.08 USDC) ━━━");
  const compareRes = await fetchWithPayment(`${SERVER}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      products: ["Vercel", "Netlify", "Cloudflare Pages"],
      timeRange: "90d",
      sources: ["reddit", "hn"],
      category: "devtools",
    }),
  });
  const compareData = await compareRes.json();
  console.log(JSON.stringify(compareData, null, 2));

  console.log("\n✅ All tests complete!");
}

main().catch(console.error);

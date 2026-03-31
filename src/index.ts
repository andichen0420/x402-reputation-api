// ============================================
// x402 Product Reputation API — Main Server
//
// Three paid endpoints via x402 micropayments:
//   POST /analyze  — $0.05 USDC — Full reputation report
//   POST /compare  — $0.08 USDC — Head-to-head comparison
//   POST /monitor  — $0.03 USDC — Quick sentiment pulse
//
// Free endpoints:
//   GET  /health   — Service info + Bazaar metadata
// ============================================

import "dotenv/config";
import express from "express";
import cors from "cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { createFacilitatorConfig } from "@coinbase/x402";
import { apiRouter } from "./routes/api.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── Configuration ──────────────────────────
const PORT = parseInt(process.env.PORT || "4021");
const WALLET = process.env.WALLET_ADDRESS || "0xYourEvmAddressHere";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.org/facilitator";
const NETWORK = (process.env.NETWORK || "eip155:84532") as `${string}:${string}`; // Base Sepolia testnet

const PRICE_ANALYZE = process.env.PRICE_ANALYZE || "$0.05";
const PRICE_COMPARE = process.env.PRICE_COMPARE || "$0.08";
const PRICE_MONITOR = process.env.PRICE_MONITOR || "$0.03";

// ─── x402 Payment Middleware ────────────────
const secret = (process.env.CDP_API_KEY_SECRET || "").replace(/\\n/g, "\n");
const cdpConfig = createFacilitatorConfig(process.env.CDP_API_KEY_ID, secret);
const facilitatorClient = new HTTPFacilitatorClient(cdpConfig);
const resourceServer = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(resourceServer);
resourceServer.registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      // Full reputation analysis
      "POST /analyze": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE_ANALYZE,
            network: NETWORK,
            payTo: WALLET,
          },
        ],
        description: "Full product reputation analysis with dimensional scoring, powered by Reddit + HN + YouTube data and LLM analysis",
        mimeType: "application/json",
     	extensions: { ...declareDiscoveryExtension({ input: { product: "Supabase" }, inputSchema: { properties: { product: { type: "string" } }, required: ["product"] }, bodyType: "json" as const, output: { example: { overallScore: 72 } } }) },
	 },

      // Head-to-head comparison
      "POST /compare": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE_COMPARE,
            network: NETWORK,
            payTo: WALLET,
          },
        ],
        description: "Head-to-head reputation comparison of 2-5 products across community sources",
        mimeType: "application/json",
	extensions: { ...declareDiscoveryExtension({ input: { products: ["Vercel", "Netlify"] }, inputSchema: { properties: { products: { type: "array" } }, required: ["products"] }, bodyType: "json" as const, output: { example: { winner: "Vercel" } } }) },
      },

      // Quick monitoring pulse
      "POST /monitor": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE_MONITOR,
            network: NETWORK,
            payTo: WALLET,
          },
        ],
        description: "Quick 7-day sentiment pulse for a product across Reddit and Hacker News",
        mimeType: "application/json",
	extensions: { ...declareDiscoveryExtension({ input: { product: "Cursor" }, inputSchema: { properties: { product: { type: "string" } }, required: ["product"] }, bodyType: "json" as const, output: { example: { totalMentions: 54 } } }) },
      },
    },
    resourceServer
  )
);

// ─── Routes ─────────────────────────────────
app.use("/", apiRouter);

// ─── Error Handler ──────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]", err);
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

// ─── Start ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────────┐
│  x402 Product Reputation API                    │
│                                                 │
│  Server:     http://localhost:${PORT}             │
│  Network:    ${NETWORK.padEnd(32)}│
│  Wallet:     ${WALLET.slice(0, 10)}...${WALLET.slice(-6)}                  │
│  Facilitator: ${FACILITATOR_URL.slice(0, 32).padEnd(32)}│
│                                                 │
│  Endpoints:                                     │
│    POST /analyze  ${PRICE_ANALYZE.padEnd(8)} Full reputation report    │
│    POST /compare  ${PRICE_COMPARE.padEnd(8)} Head-to-head comparison  │
│    POST /monitor  ${PRICE_MONITOR.padEnd(8)} Quick sentiment pulse    │
│    GET  /health   free    Service info           │
│                                                 │
│  Data sources: Reddit · HN Algolia · YouTube    │
│  LLM: Claude Sonnet                             │
└─────────────────────────────────────────────────┘
  `);
});

export default app;

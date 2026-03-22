# x402 Product Reputation API

A pay-per-call product reputation intelligence API monetized via the [x402 protocol](https://x402.org). AI agents and developers pay USDC micropayments to get structured reputation analysis of any product, powered by community data from Reddit, Hacker News, and YouTube.

## Architecture

```
┌─────────────┐     HTTP 402      ┌──────────────────┐
│  AI Agent /  │ ◄──────────────► │  x402 Reputation │
│  Developer   │   USDC payment   │     API Server   │
└─────────────┘                   └────────┬─────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
             ┌──────────┐         ┌──────────────┐       ┌──────────────┐
             │  Reddit   │         │  HN Algolia  │       │   YouTube    │
             │  JSON API │         │   Search API │       │  Transcripts │
             └──────────┘         └──────────────┘       └──────────────┘
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           ▼
                                  ┌──────────────────┐
                                  │  Claude Sonnet   │
                                  │  (LLM Analysis)  │
                                  └──────────────────┘
                                           │
                                           ▼
                                  ┌──────────────────┐
                                  │ Structured Report │
                                  │ Score + Dimensions│
                                  │ + Competitor Map  │
                                  └──────────────────┘
```

## Endpoints & Pricing

| Endpoint | Price (USDC) | Description |
|----------|-------------|-------------|
| `POST /analyze` | $0.05 | Full reputation report with dimensional scoring |
| `POST /compare` | $0.08 | Head-to-head comparison of 2-5 products |
| `POST /monitor` | $0.03 | Quick 7-day sentiment pulse |
| `GET /health` | Free | Service info + Bazaar metadata |

## Quick Start

### 1. Install

```bash
git clone <your-repo>
cd x402-reputation-api
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your:
#   - WALLET_ADDRESS (your EVM address for receiving USDC)
#   - ANTHROPIC_API_KEY (for LLM analysis)
#   - NETWORK (eip155:84532 for testnet, eip155:8453 for mainnet)
```

### 3. Run

```bash
# Development
npm run dev

# Production
npm run build && npm start
```

### 4. Test with x402 client

```bash
# Get testnet USDC from https://faucet.circle.com/
EVM_PRIVATE_KEY=0x... npx tsx test-client.ts
```

## API Reference

### POST /analyze

Full reputation analysis with dimensional scoring.

**Request:**
```json
{
  "product": "Supabase",
  "competitors": ["Firebase", "PlanetScale"],
  "timeRange": "90d",
  "sources": ["reddit", "hn", "youtube"],
  "category": "devtools"
}
```

**Response:**
```json
{
  "product": "Supabase",
  "overallScore": 78,
  "overallSentiment": "positive",
  "confidence": 0.72,
  "dimensions": [
    {
      "dimension": "Developer Experience",
      "score": 85,
      "sentiment": "positive",
      "evidence": [
        "Community frequently praises migration from Firebase as seamless",
        "Documentation quality cited as standout feature"
      ],
      "sampleSize": 34
    },
    {
      "dimension": "Pricing",
      "score": 72,
      "sentiment": "mixed",
      "evidence": [
        "Free tier widely praised, but scaling costs concern some users",
        "Comparisons to PlanetScale pricing are common"
      ],
      "sampleSize": 18
    }
  ],
  "sources": [
    { "source": "reddit", "postsAnalyzed": 89, "avgSentiment": 0.3 },
    { "source": "hn", "postsAnalyzed": 45, "avgSentiment": 0.2 }
  ],
  "competitors": [
    {
      "product": "Firebase",
      "overallScore": 65,
      "strengthVs": ["Ecosystem integration", "Mobile SDK maturity"],
      "weaknessVs": ["Vendor lock-in concerns", "Pricing transparency"],
      "dimensions": { "Developer Experience": 70, "Pricing": 55 }
    }
  ],
  "totalDataPoints": 134,
  "generatedAt": "2026-03-20T12:00:00.000Z"
}
```

### POST /compare

Head-to-head comparison of multiple products.

**Request:**
```json
{
  "products": ["Vercel", "Netlify", "Cloudflare Pages"],
  "timeRange": "90d",
  "sources": ["reddit", "hn"],
  "category": "devtools"
}
```

### POST /monitor

Quick 7-day sentiment pulse (cheaper, faster).

**Request:**
```json
{
  "product": "Cursor",
  "sources": ["reddit", "hn"]
}
```

## Data Sources

| Source | API | Auth | Rate Limit |
|--------|-----|------|------------|
| Hacker News | Algolia Search API | None | 10,000 req/hr |
| Reddit | Public JSON API | None (OAuth optional) | ~60 req/min |
| YouTube | Invidious API → Transcripts | None | Varies by instance |

## Deployment

### Deploy to Railway / Render / Fly.io

Standard Node.js deployment. Set environment variables and expose port 4021.

### Switch to Mainnet

In `.env`:
```env
NETWORK=eip155:8453
FACILITATOR_URL=https://x402.org/facilitator
# Add CDP API keys if using Coinbase facilitator for mainnet
```

### Register on Bazaar

When using the CDP facilitator, your endpoints are automatically discoverable via the x402 Bazaar. The `config.description`, `inputSchema`, and `outputSchema` in the payment middleware are used for service discovery.

## For AI Agents

This API is designed for autonomous AI agent consumption:

1. Agent discovers the API via Bazaar or direct URL
2. Agent sends request → receives 402 with payment instructions
3. Agent's x402 client auto-pays USDC and retries
4. Agent receives structured JSON reputation data

No accounts, no API keys, no subscriptions — just HTTP + USDC.

## Category Options

Use the `category` field to tune subreddit selection:

- `default` — General tech
- `saas` — SaaS products
- `devtools` — Developer tools
- `ai` — AI/ML products
- `crypto` — Crypto/Web3
- `hardware` — Physical products
- `fintech` — Financial technology

## License

MIT

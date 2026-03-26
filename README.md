# Stablecoin Payment Orchestrator

A custodial payment orchestrator that accepts merchant payment requests in USD and dynamically routes USDC transfers across Ethereum and Solana based on cost, latency, and reliability.

> **[Read the full documentation](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/)**

## How It Works

1. **Merchant requests a quote** — the routing engine scores each chain using real-time health metrics and the merchant's priority (`low_fee`, `fast`, or `reliable`)
2. **Merchant confirms a payment intent** — treasury funds are reserved and a transaction job is enqueued
3. **Worker broadcasts the transaction** — the chain adapter sends USDC on the selected blockchain
4. **Confirmation monitor settles the payment** — once finalized on-chain, the merchant receives a signed webhook

## Architecture

```
Merchant ──► API Service ──► Routing Engine ──► Score & select chain
                 │                                    │
                 ▼                              Chain Health DB
            BullMQ Queue
                 │
                 ▼
           Worker Service
           ┌────┬────┬────┐
           │    │    │    │
         Exec Confirm Hook Metrics
           │    │
      Chain Adapters
      (ETH / SOL)
```

| Component | Technology |
|:----------|:-----------|
| Language | TypeScript (Node.js) |
| API | Fastify |
| Job Queue | BullMQ |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Ethereum | ethers.js |
| Solana | @solana/web3.js |

## Project Structure

```
├── packages/
│   ├── common/            # Shared types, DB/Redis clients, utilities
│   ├── routing-engine/    # Route scoring & selection algorithm
│   ├── chain-adapters/    # Ethereum & Solana blockchain adapters
│   └── ledger/            # Double-entry balance tracking
├── apps/
│   ├── api-service/       # REST API (port 3000)
│   └── worker-service/    # Background workers & metrics collector
└── infra/
    ├── migrations/        # PostgreSQL schema & seed data
    └── docker/            # Docker Compose (Postgres + Redis)
```

## Getting Started

```bash
# Start Postgres & Redis
docker compose -f infra/docker/docker-compose.yml up -d

# Install & build
npm install
npm run build

# Run migrations
npm run migrate

# Start services (in separate terminals)
npm run dev:api
npm run dev:worker
```

## Quick Example

```bash
# Create a quote
curl -X POST http://localhost:3000/quotes \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-api-key" \
  -d '{
    "amount_usd": 100.00,
    "destination": {
      "ethereum_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      "solana_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    },
    "priority": "low_fee"
  }'

# Create a payment intent from the quote
curl -X POST http://localhost:3000/payment_intents \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-api-key" \
  -d '{ "quote_id": "quo_...", "idempotency_key": "order-123" }'
```

## Key Features

- **Multi-chain routing** — selects the optimal chain per payment using weighted scoring
- **Priority profiles** — `low_fee` (60% fee weight), `fast` (65% latency weight), `reliable` (75% reliability weight)
- **Double-entry ledger** — full audit trail of reserves, debits, fees, and releases
- **Idempotent payments** — duplicate requests return the existing intent
- **Async execution** — BullMQ with 3 retries and exponential backoff
- **Chain health monitoring** — metrics collected every 15s drive routing decisions
- **Webhook delivery** — HMAC-SHA256 signed notifications with up to 5 retries
- **Admin API** — payment stats, route distribution, and failure analysis

## Documentation

Full documentation is available at **[vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/)**, covering:

- [Getting Started](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/getting-started)
- [Architecture](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/architecture)
- [API Reference](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/api-reference)
- [Routing Engine](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/routing-engine)
- [Chain Adapters](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/chain-adapters)
- [Database Schema](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/database)
- [Configuration](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/configuration)
- [Deployment](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/deployment)

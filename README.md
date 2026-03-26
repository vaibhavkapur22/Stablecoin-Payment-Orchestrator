# Stablecoin Payment Orchestrator

A custodial payment orchestrator that accepts merchant payment requests in USD and dynamically routes USDC transfers across Ethereum and Solana based on cost, latency, and reliability.

## How It Works

1. **Merchant requests a quote** — the routing engine scores each chain using real-time health metrics and the merchant's priority (`low_fee`, `fast`, or `reliable`)
2. **Merchant confirms a payment intent** — treasury funds are reserved and a transaction job is enqueued
3. **Worker broadcasts the transaction** — the chain adapter sends USDC on the selected blockchain
4. **Confirmation monitor settles the payment** — once finalized on-chain, the merchant receives a signed webhook

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

## Documentation

Full documentation is available at **[vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/)**.

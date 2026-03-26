# Stablecoin Payment Orchestrator

A custodial payment orchestrator that accepts merchant payment requests in USD and dynamically routes USDC transfers across Ethereum and Solana based on cost, latency, and reliability.

> **[Read the full documentation](https://vaibhavkapur22.github.io/Stablecoin-Payment-Orchestrator/)**

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

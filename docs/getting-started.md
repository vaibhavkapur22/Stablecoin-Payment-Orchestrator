---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started
{: .no_toc }

Set up and run the Stablecoin Payment Orchestrator locally in under 5 minutes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Prerequisites

- **Node.js** >= 18
- **Yarn** (or npm)
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- **Git**

## Clone the Repository

```bash
git clone https://github.com/vaibhavkapur/Payment-Orchestrator.git
cd Payment-Orchestrator
```

## Install Dependencies

```bash
npm install
```

This installs all dependencies across the monorepo using Yarn workspaces.

## Start Infrastructure

Start PostgreSQL and Redis using Docker Compose:

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 16** on port `5432` (user: `orchestrator`, password: `orchestrator`, database: `orchestrator`)
- **Redis 7** on port `6379`

## Configure Environment

Copy the example environment file and customize:

```bash
cp .env.example .env
```

For local development, the defaults work out of the box with the Docker Compose setup. For blockchain integration, you'll need to provide RPC URLs and treasury private keys. See the [Configuration Reference](/Stablecoin-Payment-Orchestrator/configuration) for all options.

## Run Database Migrations

```bash
npm run migrate
```

This creates all required tables and inserts seed data including a test merchant and treasury wallets.

## Build the Project

```bash
npm run build
```

## Start the Services

Open two terminal windows:

**Terminal 1 --- API Service:**
```bash
npm run dev:api
```

The API starts on `http://localhost:3000`.

**Terminal 2 --- Worker Service:**
```bash
npm run dev:worker
```

This starts the execution worker, confirmation monitor, webhook dispatcher, and metrics collector.

## Verify the Setup

Check the health endpoint:

```bash
curl http://localhost:3000/health
```

Check the admin overview (no auth required):

```bash
curl http://localhost:3000/admin/overview
```

## Make Your First Payment

### 1. Create a Quote

```bash
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
```

This returns a quote with candidate routes and the recommended chain:

```json
{
  "quote_id": "quo_abc123",
  "amount_usd": 100,
  "candidate_routes": [
    {
      "chain": "solana",
      "estimated_fee_usd": 0.02,
      "estimated_settlement_seconds": 8,
      "reliability_score": 0.95,
      "final_score": 0.912
    },
    {
      "chain": "ethereum",
      "estimated_fee_usd": 1.83,
      "estimated_settlement_seconds": 75,
      "reliability_score": 0.98,
      "final_score": 0.234
    }
  ],
  "recommended_route": "solana",
  "expires_at": "2024-01-15T10:05:00.000Z"
}
```

### 2. Create a Payment Intent

```bash
curl -X POST http://localhost:3000/payment_intents \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-api-key" \
  -d '{
    "quote_id": "quo_abc123",
    "idempotency_key": "order-12345"
  }'
```

This creates the payment intent, reserves treasury funds, and enqueues the transaction for execution:

```json
{
  "payment_intent_id": "pi_xyz789",
  "status": "route_selected",
  "amount_usd": 100,
  "selected_chain": "solana",
  "destination_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "created_at": "2024-01-15T10:00:15.000Z"
}
```

### 3. Check Payment Status

```bash
curl http://localhost:3000/payment_intents/pi_xyz789 \
  -H "X-Api-Key: test-api-key"
```

## What's Next

- [Architecture](/Stablecoin-Payment-Orchestrator/architecture) --- Understand the system design
- [API Reference](/Stablecoin-Payment-Orchestrator/api-reference) --- Full endpoint documentation
- [Routing Engine](/Stablecoin-Payment-Orchestrator/routing-engine) --- How chain selection works
- [Configuration](/Stablecoin-Payment-Orchestrator/configuration) --- All environment variables

---
title: Home
layout: home
nav_order: 1
---

# Stablecoin Payment Orchestrator
{: .fs-9 }

A custodial payment orchestrator that accepts merchant payment requests in USD and dynamically routes USDC transfers across Ethereum and Solana based on cost, latency, and reliability.
{: .fs-6 .fw-300 }

[Get Started](/Payment-Orchestrator/getting-started){: .btn .btn-primary .fs-5 .mb-4 .mb-md-0 .mr-2 }
[API Reference](/Payment-Orchestrator/api-reference){: .btn .fs-5 .mb-4 .mb-md-0 }

---

## Overview

The Stablecoin Payment Orchestrator is a production-grade backend system that enables merchants to accept USDC payments across multiple blockchains through a single API. The orchestrator handles chain selection, transaction execution, confirmation monitoring, and webhook delivery.

### Key Features

- **Multi-chain routing** --- Automatically selects the optimal blockchain (Ethereum or Solana) based on real-time metrics
- **Priority-based scoring** --- Supports `low_fee`, `fast`, and `reliable` routing priorities with configurable weight profiles
- **Custodial treasury management** --- Manages treasury wallets with double-entry ledger accounting
- **Idempotent payments** --- Built-in idempotency keys prevent duplicate payment execution
- **Async execution** --- BullMQ job queue with retry logic and exponential backoff
- **Real-time health monitoring** --- Continuous chain health collection drives routing decisions
- **Webhook delivery** --- HMAC-signed webhook notifications with automatic retries
- **Admin dashboard API** --- Analytics endpoints for payment stats, route distribution, and failure analysis

### Architecture at a Glance

```
Merchant API Request
        |
   [ API Service ]  ---- POST /quotes ---- [ Routing Engine ]
        |                                        |
   POST /payment_intents                  Score & select chain
        |                                        |
   [ BullMQ Queue ]                      [ Chain Health DB ]
        |
   [ Worker Service ]
        |
   +----+----+----+
   |    |    |    |
  Exec Confirm Webhook Metrics
   |    |    |    |
  Chain Adapters   |
  (ETH / SOL)     DB
```

### Tech Stack

| Component | Technology |
|:----------|:-----------|
| Language | TypeScript (Node.js) |
| API Framework | Fastify |
| Job Queue | BullMQ |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 |
| Ethereum | ethers.js |
| Solana | @solana/web3.js |
| Monorepo | Yarn Workspaces |

### Project Structure

```
Payment Orchestrator/
├── packages/
│   ├── common/            # Shared types, DB/Redis clients, utilities
│   ├── routing-engine/    # Route selection & scoring algorithm
│   ├── chain-adapters/    # Ethereum & Solana blockchain adapters
│   └── ledger/            # Double-entry balance tracking
├── apps/
│   ├── api-service/       # Fastify REST API (port 3000)
│   └── worker-service/    # Background workers & metrics collector
├── infra/
│   ├── migrations/        # PostgreSQL schema & seed data
│   └── docker/            # Docker Compose (Postgres + Redis)
└── .env.example           # Environment variable template
```

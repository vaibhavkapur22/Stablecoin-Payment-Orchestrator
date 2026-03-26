---
title: Architecture
layout: default
nav_order: 3
---

# Architecture
{: .no_toc }

A deep dive into the system design, data flow, and key architectural patterns.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## System Overview

The orchestrator follows a **microservices-lite** pattern: a single API service handles synchronous requests, while a separate worker service handles all asynchronous processing. Both share a PostgreSQL database and Redis instance.

```
                    ┌─────────────────────┐
                    │   Merchant Client    │
                    └─────────┬───────────┘
                              │ HTTPS
                    ┌─────────▼───────────┐
                    │    API Service       │
                    │  (Fastify, :3000)    │
                    │                     │
                    │  /quotes            │
                    │  /payment_intents   │
                    │  /admin/*           │
                    └──┬──────────┬───────┘
                       │          │
              ┌────────▼──┐  ┌───▼────────┐
              │ PostgreSQL │  │   Redis     │
              │   (data)   │  │ (queue +    │
              │            │  │  nonce mgr) │
              └────────▲──┘  └───▲────────┘
                       │          │
                    ┌──┴──────────┴───────┐
                    │   Worker Service     │
                    │                     │
                    │  Execution Worker   │
                    │  Confirmation Wkr   │
                    │  Webhook Worker     │
                    │  Metrics Collector  │
                    └──┬──────────┬───────┘
                       │          │
              ┌────────▼──┐  ┌───▼────────┐
              │  Ethereum  │  │   Solana    │
              │   (USDC)   │  │   (USDC)    │
              └────────────┘  └─────────────┘
```

## Monorepo Structure

The project uses **Yarn workspaces** with **TypeScript composite builds** for cross-package type safety.

| Package | Purpose |
|:--------|:--------|
| `packages/common` | Shared types, database client, Redis client, error classes, ID generation |
| `packages/routing-engine` | Chain scoring algorithm and route selection |
| `packages/chain-adapters` | Blockchain-specific transaction execution (Ethereum, Solana) |
| `packages/ledger` | Double-entry ledger for treasury balance accounting |
| `apps/api-service` | Fastify REST API for merchants and admin |
| `apps/worker-service` | Background workers for execution, confirmation, webhooks, metrics |

## Payment Lifecycle

A payment goes through the following states:

```
created ─► quoted ─► route_selected ─► broadcasting ─► broadcasted
                                                           │
                                           ┌───────────────┤
                                           ▼               ▼
                                       settled      pending_confirmation
                                                           │
                                           ┌───────────────┤
                                           ▼               ▼
                                       settled       manual_review
```

**Failure can occur at any stage**, transitioning to `failed` with reserve release.

### Step-by-Step Flow

**1. Quote Creation** (`POST /quotes`)
- Merchant sends amount, destination addresses, and priority
- Routing engine fetches latest chain health snapshots and treasury balances
- Each chain is scored based on the priority profile
- A quote is created with a 5-minute TTL containing all candidate routes

**2. Payment Intent Creation** (`POST /payment_intents`)
- Merchant submits a quote ID and idempotency key
- System validates quote freshness and merchant ownership
- Row-level lock acquired on the treasury wallet for the selected chain
- Available balance checked; funds moved to reserved balance
- Ledger entry created (type: `reserve`)
- Payment execution job enqueued to BullMQ

**3. Transaction Execution** (Worker)
- Execution worker picks up the job from BullMQ
- Validates payment intent is still in `route_selected` status
- Calls chain adapter to broadcast the USDC transfer on-chain
- Creates a payment attempt record with the transaction ID
- Updates status to `broadcasted`; creates ledger entry (type: `debit`)
- On failure: status set to `failed`, reserve released, failure webhook emitted

**4. Confirmation Monitoring** (Worker, every 15s)
- Confirmation worker polls all `broadcasted` payment attempts
- Calls chain adapter `checkConfirmation()` for each
- On confirmation: updates attempt to `confirmed`, payment intent to `settled`
- Records actual fee in ledger (type: `fee`)
- Updates treasury: releases reserved balance, deducts from available
- Emits `payment.settled` webhook
- Detects stuck transactions (>10 minutes): moves to `manual_review`

**5. Webhook Delivery** (Worker, every 5s)
- Polls `webhook_events` table for undelivered events
- Delivers via HTTPS POST with HMAC-SHA256 signature
- Retries up to 5 times on failure

## Key Architectural Patterns

### Idempotency

Every payment intent requires a unique `idempotency_key` per merchant. The database enforces this with a `UNIQUE(merchant_id, idempotency_key)` constraint. If a duplicate request arrives, the existing payment intent is returned without creating a new one.

### Double-Entry Ledger

All balance movements are recorded in the `ledger_entries` table:

| Entry Type | When | Effect |
|:-----------|:-----|:-------|
| `reserve` | Payment intent created | Funds moved from available to reserved |
| `debit` | Transaction broadcasted | Records the transfer amount |
| `fee` | Transaction confirmed | Records the actual gas/transaction fee |
| `release` | Payment failed | Reserved funds returned to available |
| `refund` | Payment reversed | Funds returned to available |

### Row-Level Locking

When creating a payment intent, the system acquires a `SELECT ... FOR UPDATE` lock on the treasury wallet row. This prevents race conditions where two concurrent payments could both see sufficient balance.

### Job Queue with Retries

BullMQ handles payment execution with:
- Up to **3 retry attempts** per job
- **Exponential backoff** starting at 5 seconds
- Dead-letter queue for permanently failed jobs

### Chain Health Monitoring

The metrics collector runs every 15 seconds, polling each chain adapter for:
- Average confirmation time
- RPC error rate
- P95 latency
- Congestion score
- Estimated transaction fee

These snapshots drive the routing engine's chain selection algorithm.

## Security Model

### API Authentication

Merchants authenticate using API keys passed in the `X-Api-Key` header. Keys are hashed with HMAC-SHA256 using a configurable salt before storage. The system never stores plaintext API keys.

### Webhook Signing

Webhook payloads are signed using HMAC-SHA256 with a shared secret. Merchants can verify the signature to ensure webhook authenticity.

### Custodial Model

The orchestrator operates a **custodial model** where treasury wallets are owned by the operator. Private keys for these wallets are stored as environment variables and never exposed through the API.

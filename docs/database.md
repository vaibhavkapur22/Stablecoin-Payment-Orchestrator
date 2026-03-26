---
title: Database Schema
layout: default
nav_order: 9
---

# Database Schema
{: .no_toc }

PostgreSQL schema reference for all tables, indexes, and relationships.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Entity Relationship

```
merchants
    │
    ├── 1:N ── quotes
    ├── 1:N ── payment_intents ── 1:N ── payment_attempts
    │                           └── 1:N ── ledger_entries
    └── 1:N ── webhook_events

treasury_wallets (standalone)
chain_health_snapshots (standalone, time-series)
```

---

## Tables

### merchants

Registered API clients that can create payments.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID (e.g., `mer_...`) |
| `api_key_hash` | `TEXT` | NOT NULL, UNIQUE | HMAC-SHA256 hashed API key |
| `name` | `TEXT` | NOT NULL | Merchant display name |
| `webhook_url` | `TEXT` | | HTTPS endpoint for webhook delivery |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |

### quotes

Temporary payment quotes with scored route candidates. Expire after 5 minutes.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID (e.g., `quo_...`) |
| `merchant_id` | `TEXT` | NOT NULL, FK → merchants | Owning merchant |
| `amount_usd` | `NUMERIC(18,6)` | NOT NULL | Payment amount |
| `priority` | `TEXT` | NOT NULL, CHECK | `low_fee`, `fast`, or `reliable` |
| `destination_ethereum` | `TEXT` | | Ethereum recipient address |
| `destination_solana` | `TEXT` | | Solana recipient address |
| `candidate_routes` | `JSONB` | NOT NULL, DEFAULT '[]' | Scored route array |
| `recommended_chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | Quote expiration (5-min TTL) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:** `idx_quotes_merchant(merchant_id)`, `idx_quotes_expires(expires_at)`

### payment_intents

Core payment state machine. Tracks a payment from creation through settlement or failure.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID (e.g., `pi_...`) |
| `merchant_id` | `TEXT` | NOT NULL, FK → merchants | Owning merchant |
| `quote_id` | `TEXT` | NOT NULL, FK → quotes | Source quote |
| `idempotency_key` | `TEXT` | NOT NULL | Client-provided dedup key |
| `amount_usd` | `NUMERIC(18,6)` | NOT NULL | Payment amount |
| `selected_chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `destination_address` | `TEXT` | NOT NULL | Recipient address on selected chain |
| `status` | `TEXT` | NOT NULL, DEFAULT 'created', CHECK | Current state |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last update |

**Unique constraint:** `(merchant_id, idempotency_key)`

**Indexes:** `idx_pi_merchant`, `idx_pi_status`, `idx_pi_idempotency`

**Valid statuses:** `created`, `quoted`, `route_selected`, `broadcasting`, `broadcasted`, `pending_confirmation`, `settled`, `failed`, `manual_review`, `retrying`, `expired`, `cancelled`

### payment_attempts

Individual on-chain transaction attempts for a payment intent. A payment may have multiple attempts if retries occur.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID (e.g., `att_...`) |
| `payment_intent_id` | `TEXT` | NOT NULL, FK → payment_intents | Parent payment |
| `chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `tx_id` | `TEXT` | | On-chain transaction hash/signature |
| `rpc_provider` | `TEXT` | NOT NULL | RPC endpoint used |
| `estimated_fee_usd` | `NUMERIC(18,6)` | NOT NULL | Pre-broadcast fee estimate |
| `actual_fee_native` | `NUMERIC(18,9)` | | Actual fee in native token |
| `broadcast_at` | `TIMESTAMPTZ` | | When transaction was broadcast |
| `confirmed_at` | `TIMESTAMPTZ` | | When transaction was confirmed |
| `status` | `TEXT` | NOT NULL, DEFAULT 'pending', CHECK | `pending`, `broadcasted`, `confirmed`, `failed` |
| `failure_reason` | `TEXT` | | Failure description if failed |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:** `idx_attempts_pi`, `idx_attempts_status`, `idx_attempts_tx`

### treasury_wallets

Operator-controlled wallets that fund payments. One per chain.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID |
| `chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `address` | `TEXT` | NOT NULL, UNIQUE | Wallet address |
| `available_balance` | `NUMERIC(18,6)` | NOT NULL, DEFAULT 0 | Funds available for new payments |
| `reserved_balance` | `NUMERIC(18,6)` | NOT NULL, DEFAULT 0 | Funds locked for pending payments |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Last balance update |

**Index:** `idx_treasury_chain`

### chain_health_snapshots

Time-series metrics collected from chain adapters. Used by the routing engine.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID |
| `chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `timestamp` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Collection time |
| `avg_confirmation_seconds` | `NUMERIC(10,2)` | NOT NULL | Average block confirmation time |
| `rpc_error_rate` | `NUMERIC(5,4)` | NOT NULL | Fraction of failed RPC calls (0-1) |
| `p95_latency_ms` | `INTEGER` | NOT NULL | 95th percentile RPC latency |
| `congestion_score` | `NUMERIC(5,4)` | NOT NULL | Network congestion metric (0-1) |
| `health_status` | `TEXT` | NOT NULL, CHECK | `healthy`, `degraded`, or `unhealthy` |
| `estimated_fee_usd` | `NUMERIC(18,6)` | NOT NULL | Estimated transaction fee in USD |

**Index:** `idx_health_chain_ts(chain, timestamp DESC)`

### ledger_entries

Double-entry accounting records for all balance movements.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID |
| `payment_intent_id` | `TEXT` | NOT NULL, FK → payment_intents | Associated payment |
| `type` | `TEXT` | NOT NULL, CHECK | `reserve`, `debit`, `fee`, `release`, `refund` |
| `amount` | `NUMERIC(18,6)` | NOT NULL | Entry amount |
| `currency` | `TEXT` | NOT NULL | Token (e.g., USDC, ETH, SOL) |
| `chain` | `TEXT` | NOT NULL, CHECK | `ethereum` or `solana` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:** `idx_ledger_pi`, `idx_ledger_chain`, `idx_ledger_type`

### webhook_events

Outbound webhook event queue with delivery tracking.

| Column | Type | Constraints | Description |
|:-------|:-----|:------------|:------------|
| `id` | `TEXT` | PRIMARY KEY | Prefixed ID |
| `merchant_id` | `TEXT` | NOT NULL, FK → merchants | Target merchant |
| `payment_intent_id` | `TEXT` | NOT NULL, FK → payment_intents | Associated payment |
| `event_type` | `TEXT` | NOT NULL | Event type string |
| `payload` | `JSONB` | NOT NULL, DEFAULT '{}' | Event payload |
| `delivered` | `BOOLEAN` | NOT NULL, DEFAULT FALSE | Delivery status |
| `attempts` | `INTEGER` | NOT NULL, DEFAULT 0 | Delivery attempt count |
| `last_attempt_at` | `TIMESTAMPTZ` | | Last delivery attempt time |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes:** `idx_webhooks_merchant`, `idx_webhooks_undelivered` (partial: WHERE NOT delivered)

---
title: Workers
layout: default
nav_order: 10
---

# Workers
{: .no_toc }

Background processes that handle asynchronous payment execution, monitoring, and delivery.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

The worker service runs four concurrent background processes. They operate independently and communicate through the shared PostgreSQL database and Redis queue.

## Execution Worker

**Type:** BullMQ consumer
**Queue:** `payment-execution`

Processes payment execution jobs enqueued by the API service.

### Flow

1. Receive job with `paymentIntentId`
2. Load payment intent from database
3. Validate status is `route_selected`
4. Load chain adapter for the selected chain
5. Call `buildAndSendTransfer()` to broadcast the transaction
6. Create a `payment_attempt` record with the transaction ID
7. Update payment intent status to `broadcasted`
8. Create a `debit` ledger entry

### Error Handling

On failure:
- Payment intent status set to `failed`
- Reserved balance released via `release` ledger entry
- Treasury available balance restored
- `payment.failed` webhook event created

### Retry Configuration

| Setting | Value |
|:--------|:------|
| Max attempts | 3 |
| Backoff type | Exponential |
| Initial delay | 5,000 ms |

---

## Confirmation Worker

**Type:** Interval-based polling
**Interval:** 15 seconds

Monitors broadcasted transactions for on-chain finality.

### Flow

1. Query all payment attempts with status `broadcasted`
2. For each attempt, call `checkConfirmation()` on the chain adapter
3. If confirmed:
   - Update attempt status to `confirmed`
   - Update payment intent status to `settled`
   - Record actual fee via `fee` ledger entry
   - Update treasury: release reserved, deduct available
   - Create `payment.settled` webhook event
4. If not confirmed and older than 10 minutes:
   - Move payment intent to `manual_review` status
   - Create `payment.manual_review` webhook event

### Stuck Transaction Detection

Transactions that remain unconfirmed for more than **10 minutes** are flagged for manual review. This catches scenarios like:
- Dropped transactions
- Extreme network congestion
- RPC provider issues

---

## Webhook Worker

**Type:** Interval-based polling
**Interval:** 5 seconds

Delivers webhook events to merchant endpoints.

### Flow

1. Query `webhook_events` where `delivered = false` and `attempts < 5`
2. For each event:
   - Load merchant's `webhook_url`
   - Send HTTPS POST with JSON payload
   - Include HMAC-SHA256 signature header
3. On success: mark as `delivered = true`
4. On failure: increment `attempts`, update `last_attempt_at`

### Delivery Guarantees

| Property | Value |
|:---------|:------|
| Delivery model | At-least-once |
| Max attempts | 5 |
| Signature algorithm | HMAC-SHA256 |

---

## Metrics Collector

**Type:** Interval-based polling
**Interval:** Configurable (`METRICS_INTERVAL_MS`, default 15,000 ms)

Collects real-time health metrics from each chain adapter.

### Flow

1. For each registered chain adapter:
   - Call `getHealthMetrics()`
   - Derive health status from raw metrics
   - Insert a `chain_health_snapshot` record
2. On adapter failure:
   - Insert an `unhealthy` snapshot as a fallback
   - Routing engine will deprioritize or skip this chain

### Health Status Logic

```
if (rpc_error_rate > 0.30 || congestion_score > 0.80) → unhealthy
if (rpc_error_rate > 0.10 || congestion_score > 0.50) → degraded
else → healthy
```

### Collected Metrics

| Metric | Description | Used By |
|:-------|:------------|:--------|
| `avg_confirmation_seconds` | Mean block confirmation time | Latency scoring |
| `rpc_error_rate` | Fraction of failed RPC calls | Reliability scoring, health status |
| `p95_latency_ms` | 95th percentile RPC latency | Monitoring |
| `congestion_score` | Network congestion (0-1) | Health status |
| `estimated_fee_usd` | Current fee estimate in USD | Fee scoring |

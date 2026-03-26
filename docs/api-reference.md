---
title: API Reference
layout: default
nav_order: 4
---

# API Reference
{: .no_toc }

Complete reference for all REST API endpoints.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Base URL

```
http://localhost:3000
```

## Authentication

All merchant endpoints require an API key passed in the `X-Api-Key` header.

```
X-Api-Key: your-api-key-here
```

In development mode, any API key will authenticate as the test merchant (`mer_test_merchant_01`). In production, the key is hashed with HMAC-SHA256 and matched against stored hashes.

Admin endpoints (`/admin/*`) do not require authentication.

---

## Quotes

### Create Quote

Creates a payment quote with scored candidate routes across available chains.

```
POST /quotes
```

**Headers:**

| Header | Required | Description |
|:-------|:---------|:------------|
| `X-Api-Key` | Yes | Merchant API key |
| `Content-Type` | Yes | `application/json` |

**Request Body:**

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `amount_usd` | `number` | Yes | Payment amount in USD. Must be positive. |
| `destination.ethereum_address` | `string` | Conditional | Recipient Ethereum address. At least one destination required. |
| `destination.solana_address` | `string` | Conditional | Recipient Solana address. At least one destination required. |
| `priority` | `string` | Yes | Routing priority: `low_fee`, `fast`, or `reliable`. |

**Example Request:**

```bash
curl -X POST http://localhost:3000/quotes \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-api-key" \
  -d '{
    "amount_usd": 250.00,
    "destination": {
      "ethereum_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
      "solana_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
    },
    "priority": "low_fee"
  }'
```

**Response:** `201 Created`

```json
{
  "quote_id": "quo_abc123def456",
  "amount_usd": 250,
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

**Error Responses:**

| Status | Code | Description |
|:-------|:-----|:------------|
| `400` | `INVALID_AMOUNT` | `amount_usd` must be positive |
| `400` | `MISSING_DESTINATION` | At least one destination address is required |
| `400` | `INVALID_PRIORITY` | Priority must be `low_fee`, `fast`, or `reliable` |
| `401` | `UNAUTHORIZED` | Missing or invalid API key |

{: .note }
Quotes expire after **5 minutes**. Create a new quote if the previous one has expired.

---

## Payment Intents

### Create Payment Intent

Creates a payment intent from a valid quote and begins asynchronous execution.

```
POST /payment_intents
```

**Headers:**

| Header | Required | Description |
|:-------|:---------|:------------|
| `X-Api-Key` | Yes | Merchant API key |
| `Content-Type` | Yes | `application/json` |

**Request Body:**

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `quote_id` | `string` | Yes | ID of a valid, unexpired quote |
| `idempotency_key` | `string` | Yes | Unique key to prevent duplicate payments |

**Example Request:**

```bash
curl -X POST http://localhost:3000/payment_intents \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: test-api-key" \
  -d '{
    "quote_id": "quo_abc123def456",
    "idempotency_key": "order-12345"
  }'
```

**Response:** `201 Created`

```json
{
  "payment_intent_id": "pi_xyz789abc012",
  "status": "route_selected",
  "amount_usd": 250,
  "selected_chain": "solana",
  "destination_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "created_at": "2024-01-15T10:00:15.000Z"
}
```

**Error Responses:**

| Status | Code | Description |
|:-------|:-----|:------------|
| `400` | `MISSING_QUOTE_ID` | `quote_id` is required |
| `400` | `MISSING_IDEMPOTENCY_KEY` | `idempotency_key` is required |
| `400` | `QUOTE_EXPIRED` | The referenced quote has expired |
| `400` | `INSUFFICIENT_BALANCE` | Treasury has insufficient funds for this payment |
| `401` | `UNAUTHORIZED` | Missing or invalid API key |

{: .note }
If a payment intent with the same `idempotency_key` already exists for this merchant, the existing intent is returned instead of creating a duplicate.

### Get Payment Intent

Retrieves a payment intent with its attempts and ledger entries.

```
GET /payment_intents/:id
```

**Parameters:**

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `id` | `string` | Payment intent ID (e.g., `pi_xyz789abc012`) |

**Example Request:**

```bash
curl http://localhost:3000/payment_intents/pi_xyz789abc012 \
  -H "X-Api-Key: test-api-key"
```

**Response:** `200 OK`

```json
{
  "id": "pi_xyz789abc012",
  "merchant_id": "mer_test_merchant_01",
  "amount_usd": 250,
  "status": "settled",
  "selected_chain": "solana",
  "destination_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
  "attempts": [
    {
      "id": "att_123",
      "chain": "solana",
      "tx_id": "5UfDuX...",
      "status": "confirmed",
      "estimated_fee_usd": 0.02,
      "actual_fee_native": 0.000005,
      "broadcast_at": "2024-01-15T10:00:16.000Z",
      "confirmed_at": "2024-01-15T10:00:24.000Z"
    }
  ],
  "ledger_entries": [
    { "type": "reserve", "amount": 250, "currency": "USDC", "chain": "solana" },
    { "type": "debit", "amount": 250, "currency": "USDC", "chain": "solana" },
    { "type": "fee", "amount": 0.000005, "currency": "SOL", "chain": "solana" }
  ],
  "created_at": "2024-01-15T10:00:15.000Z",
  "updated_at": "2024-01-15T10:00:24.000Z"
}
```

---

## Route Debugging

### Get Route Debug Info

Returns detailed scoring and selection data for a payment intent's route.

```
GET /routes/debug/:id
```

**Parameters:**

| Parameter | Type | Description |
|:----------|:-----|:------------|
| `id` | `string` | Payment intent ID |

**Response:** `200 OK`

```json
{
  "payment_intent_id": "pi_xyz789abc012",
  "quote": { "..." : "full quote object" },
  "chain_health": [
    {
      "chain": "solana",
      "health_status": "healthy",
      "estimated_fee_usd": 0.02,
      "avg_confirmation_seconds": 8,
      "rpc_error_rate": 0.01
    }
  ],
  "treasury_balances": [
    {
      "chain": "solana",
      "available_balance": 50000,
      "reserved_balance": 250
    }
  ],
  "scoring_details": [
    {
      "chain": "solana",
      "fee_score": 0.989,
      "latency_score": 0.893,
      "reliability_score": 0.950,
      "final_score": 0.912,
      "disqualified": false
    },
    {
      "chain": "ethereum",
      "fee_score": 0.000,
      "latency_score": 0.000,
      "reliability_score": 0.980,
      "final_score": 0.234,
      "disqualified": false
    }
  ],
  "selected_chain": "solana"
}
```

---

## Webhooks

### Test Webhook

Sends a test webhook event to the merchant's configured webhook URL.

```
POST /webhooks/test
```

**Headers:**

| Header | Required | Description |
|:-------|:---------|:------------|
| `X-Api-Key` | Yes | Merchant API key |

---

## Admin Endpoints

Admin endpoints do not require authentication and are intended for internal dashboards.

{: .warning }
In production, admin endpoints should be protected behind a VPN or internal network. They are unauthenticated by default.

### Dashboard Overview

Returns aggregate payment statistics, chain health, treasury balances, and recent payments.

```
GET /admin/overview
```

**Response:** `200 OK`

```json
{
  "payments": {
    "total": 1250,
    "settled": 1180,
    "failed": 45,
    "pending": 25,
    "total_volume_usd": 2450000.00
  },
  "chain_health": [
    {
      "chain": "ethereum",
      "health_status": "healthy",
      "estimated_fee_usd": 1.83,
      "avg_confirmation_seconds": 75,
      "rpc_error_rate": 0.002
    },
    {
      "chain": "solana",
      "health_status": "healthy",
      "estimated_fee_usd": 0.02,
      "avg_confirmation_seconds": 8,
      "rpc_error_rate": 0.01
    }
  ],
  "treasury_balances": [
    {
      "chain": "ethereum",
      "address": "0x...",
      "available_balance": 100000,
      "reserved_balance": 5000
    },
    {
      "chain": "solana",
      "address": "9Wz...",
      "available_balance": 50000,
      "reserved_balance": 2000
    }
  ],
  "recent_payments": ["...last 20 payment intents with attempt data..."]
}
```

### Route Distribution

Returns payment count and volume grouped by chain.

```
GET /admin/route-distribution
```

**Response:** `200 OK`

```json
[
  { "selected_chain": "solana", "count": "850", "volume": "1200000" },
  { "selected_chain": "ethereum", "count": "400", "volume": "1250000" }
]
```

### Failure Analysis

Returns the most common failure reasons grouped by chain.

```
GET /admin/failures
```

**Response:** `200 OK`

```json
[
  { "failure_reason": "insufficient_gas", "chain": "ethereum", "count": "12" },
  { "failure_reason": "rpc_timeout", "chain": "solana", "count": "8" },
  { "failure_reason": "nonce_conflict", "chain": "ethereum", "count": "5" }
]
```

### Update Chain Health

Manually insert a chain health snapshot. Useful for testing and simulation.

```
POST /admin/chain-health
```

**Request Body:**

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `chain` | `string` | Yes | `ethereum` or `solana` |
| `health_status` | `string` | Yes | `healthy`, `degraded`, or `unhealthy` |
| `estimated_fee_usd` | `number` | No | Estimated fee (defaults to chain-specific value) |
| `avg_confirmation_seconds` | `number` | No | Avg confirmation time (defaults to chain-specific value) |
| `rpc_error_rate` | `number` | No | RPC error rate 0-1 (defaults to 0.01) |

**Example Request:**

```bash
curl -X POST http://localhost:3000/admin/chain-health \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "ethereum",
    "health_status": "degraded",
    "rpc_error_rate": 0.15
  }'
```

---

## Health Check

```
GET /health
```

Returns `200 OK` when the API service is running.

---

## Error Format

All errors follow a consistent format:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "amount_usd must be positive",
  "code": "INVALID_AMOUNT"
}
```

## Payment Statuses

| Status | Description |
|:-------|:------------|
| `created` | Payment intent created |
| `quoted` | Quote generated |
| `route_selected` | Optimal chain selected, funds reserved |
| `broadcasting` | Transaction being sent to chain |
| `broadcasted` | Transaction sent, awaiting confirmation |
| `pending_confirmation` | Waiting for on-chain finality |
| `settled` | Transaction confirmed on-chain |
| `failed` | Transaction failed (reserved funds released) |
| `manual_review` | Stuck transaction requiring manual intervention |
| `retrying` | Retrying after a failed attempt |
| `expired` | Quote or payment expired |
| `cancelled` | Payment cancelled |

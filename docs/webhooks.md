---
title: Webhooks
layout: default
nav_order: 8
---

# Webhooks
{: .no_toc }

Real-time event notifications delivered to merchant endpoints.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

The orchestrator sends webhook events to merchants whenever a payment's status changes. Webhooks are delivered via HTTPS POST to the merchant's configured `webhook_url` with HMAC-SHA256 signatures for verification.

## Event Types

| Event | Trigger |
|:------|:--------|
| `payment.created` | Payment intent created |
| `payment.broadcasting` | Transaction being sent to chain |
| `payment.broadcasted` | Transaction sent, awaiting confirmation |
| `payment.settled` | Transaction confirmed on-chain |
| `payment.failed` | Transaction failed permanently |
| `payment.manual_review` | Transaction stuck, requires manual review |

## Webhook Payload

```json
{
  "event_type": "payment.settled",
  "payment_intent_id": "pi_xyz789abc012",
  "merchant_id": "mer_test_merchant_01",
  "payload": {
    "amount_usd": 250,
    "selected_chain": "solana",
    "destination_address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "tx_id": "5UfDuX...",
    "status": "settled",
    "confirmed_at": "2024-01-15T10:00:24.000Z"
  }
}
```

## Signature Verification

Each webhook request includes an HMAC-SHA256 signature in the headers. Verify the signature to ensure the webhook is authentic.

**Signature Header:** The webhook payload is signed using the `WEBHOOK_SIGNING_SECRET` environment variable.

**Verification example (Node.js):**

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Delivery & Retries

| Property | Value |
|:---------|:------|
| Delivery method | HTTPS POST |
| Content type | `application/json` |
| Max retries | 5 |
| Polling interval | Every 5 seconds |

The webhook worker polls the `webhook_events` table for undelivered events and attempts delivery. Failed deliveries are retried up to 5 times.

## Configuration

| Variable | Description |
|:---------|:------------|
| `WEBHOOK_SIGNING_SECRET` | Secret key for HMAC-SHA256 signing |

Merchants configure their `webhook_url` in the merchants table during onboarding.

## Testing Webhooks

Use the test endpoint to send a test webhook to your configured URL:

```bash
curl -X POST http://localhost:3000/webhooks/test \
  -H "X-Api-Key: test-api-key"
```

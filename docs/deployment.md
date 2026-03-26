---
title: Deployment
layout: default
nav_order: 12
---

# Deployment Guide
{: .no_toc }

Deploying the orchestrator to production environments.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Prerequisites

- PostgreSQL 16+
- Redis 7+
- Node.js 18+
- Funded USDC treasury wallets on Ethereum and/or Solana

## Build for Production

```bash
npm install
npm run build
```

## Run the Services

The orchestrator consists of two processes that should run separately:

### API Service

```bash
node apps/api-service/dist/index.js
```

Or with environment variables:

```bash
PORT=3000 NODE_ENV=production node apps/api-service/dist/index.js
```

### Worker Service

```bash
node apps/worker-service/dist/index.js
```

## Infrastructure Requirements

### PostgreSQL

- Version 16 or higher recommended
- Run migrations before first start: `npm run migrate`
- Enable connection pooling (PgBouncer) for high-throughput deployments
- Regular backups recommended for ledger data

### Redis

- Version 7 or higher recommended
- Used for BullMQ job queue and Ethereum nonce management
- Persistence (RDB or AOF) recommended to prevent job loss on restart
- Separate Redis instances for cache vs. queue in high-throughput setups

## Production Checklist

### Security

- [ ] Set a strong, unique `API_KEY_SALT` value
- [ ] Set a strong, unique `WEBHOOK_SIGNING_SECRET` value
- [ ] Store treasury private keys in a secrets manager (not environment variables)
- [ ] Place admin endpoints behind a VPN or internal network
- [ ] Enable TLS for all external connections
- [ ] Set `NODE_ENV=production` to disable dev-mode API key bypass

### Reliability

- [ ] Run API service behind a load balancer with health checks on `GET /health`
- [ ] Run multiple worker instances (BullMQ handles job deduplication)
- [ ] Configure PostgreSQL connection pooling
- [ ] Enable Redis persistence
- [ ] Set up monitoring for stuck payments (`manual_review` status)
- [ ] Configure alerting on chain health degradation

### Blockchain

- [ ] Fund treasury wallets with sufficient USDC
- [ ] Use reliable RPC providers with high rate limits (Infura, Alchemy, QuickNode)
- [ ] Configure fallback RPC endpoints for each chain
- [ ] Monitor treasury balances and set up low-balance alerts

## Scaling Considerations

### Horizontal Scaling

| Component | Scalable? | Notes |
|:----------|:----------|:------|
| API Service | Yes | Stateless; scale behind a load balancer |
| Execution Worker | Yes | BullMQ ensures each job is processed once |
| Confirmation Worker | Careful | Multiple instances may poll the same transactions; use distributed locks if scaling |
| Webhook Worker | Careful | Same as confirmation worker |
| Metrics Collector | No | Run a single instance per deployment |

### Throughput Bottlenecks

1. **Treasury wallet balance** --- Limited by available USDC across chains
2. **Ethereum nonce management** --- Serial nonce assignment limits concurrent Ethereum transactions
3. **RPC rate limits** --- Depends on provider plan
4. **PostgreSQL connections** --- Use connection pooling

## Monitoring

### Key Metrics to Track

| Metric | Source | Alert Threshold |
|:-------|:-------|:----------------|
| Payment success rate | `payment_intents.status` | < 95% |
| Average settlement time | `payment_attempts.confirmed_at - broadcast_at` | > 5 min (Solana), > 15 min (Ethereum) |
| Treasury available balance | `treasury_wallets.available_balance` | < $10,000 |
| Chain health status | `chain_health_snapshots.health_status` | `unhealthy` |
| Webhook delivery rate | `webhook_events.delivered` | < 90% |
| Manual review count | `payment_intents.status = 'manual_review'` | > 0 |

### Recommended Tools

- **Application monitoring:** Datadog, New Relic, or Prometheus + Grafana
- **Log aggregation:** ELK stack, Datadog Logs, or CloudWatch Logs
- **Alerting:** PagerDuty, Opsgenie, or Slack integrations
- **Database monitoring:** pganalyze or built-in cloud provider tools

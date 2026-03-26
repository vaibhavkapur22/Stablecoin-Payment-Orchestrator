---
title: Configuration
layout: default
nav_order: 11
---

# Configuration Reference
{: .no_toc }

All environment variables and their defaults.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Database

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `DATABASE_URL` | Yes | `postgresql://orchestrator:orchestrator@localhost:5432/orchestrator` | PostgreSQL connection string |

## Redis

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `REDIS_HOST` | No | `localhost` | Redis host (used by BullMQ) |
| `REDIS_PORT` | No | `6379` | Redis port (used by BullMQ) |

## API Service

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `PORT` | No | `3000` | API server port |
| `API_KEY_SALT` | Yes | `dev-salt` | Salt for HMAC-SHA256 API key hashing |
| `NODE_ENV` | No | `development` | Environment mode. In non-production, any API key works with the test merchant. |

## Ethereum

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `ETH_RPC_URL` | Yes | | Primary Ethereum JSON-RPC endpoint (e.g., Infura, Alchemy) |
| `ETH_RPC_URL_FALLBACK` | No | | Fallback Ethereum RPC endpoint |
| `ETH_TREASURY_PRIVATE_KEY` | Yes | | Private key for the Ethereum treasury wallet |
| `ETH_USDC_CONTRACT` | No | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | USDC token contract address |

## Solana

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `SOL_RPC_URL` | Yes | | Primary Solana RPC endpoint |
| `SOL_RPC_URL_FALLBACK` | No | | Fallback Solana RPC endpoint |
| `SOL_TREASURY_PRIVATE_KEY` | Yes | | Base58-encoded private key for the Solana treasury wallet |
| `SOL_USDC_MINT` | No | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | USDC SPL token mint address |

## Webhooks

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `WEBHOOK_SIGNING_SECRET` | Yes | `whsec_change_me` | Secret for HMAC-SHA256 webhook signing |

## Metrics

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `METRICS_INTERVAL_MS` | No | `15000` | Health metrics collection interval in milliseconds |

---

## Example `.env` File

```bash
# Database
DATABASE_URL=postgresql://orchestrator:orchestrator@localhost:5432/orchestrator

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# Ethereum
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
ETH_RPC_URL_FALLBACK=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_TREASURY_PRIVATE_KEY=0x...
ETH_USDC_CONTRACT=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# Solana
SOL_RPC_URL=https://api.mainnet-beta.solana.com
SOL_RPC_URL_FALLBACK=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
SOL_TREASURY_PRIVATE_KEY=base58...
SOL_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# API
PORT=3000
API_KEY_SALT=change-me-in-production

# Webhooks
WEBHOOK_SIGNING_SECRET=whsec_change_me

# Metrics
METRICS_INTERVAL_MS=15000
```

{: .warning }
Never commit `.env` files with real private keys or secrets to version control. Use environment-specific secret management in production (e.g., AWS Secrets Manager, Vault, Doppler).

---

## Docker Compose Services

The included `infra/docker/docker-compose.yml` provides local development infrastructure:

| Service | Image | Port | Credentials |
|:--------|:------|:-----|:------------|
| PostgreSQL | `postgres:16` | `5432` | user: `orchestrator`, pass: `orchestrator`, db: `orchestrator` |
| Redis | `redis:7-alpine` | `6379` | No auth |

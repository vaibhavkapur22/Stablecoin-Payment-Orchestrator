# Stablecoin Payment Orchestrator

A monorepo for orchestrating stablecoin payments across multiple blockchains.

## Packages

- **chain-adapters** — Blockchain-specific adapters (Ethereum, Solana, etc.)
- **common** — Shared types, utilities, and constants
- **ledger** — Internal ledger for tracking balances and transactions
- **routing-engine** — Payment routing and optimization logic

## Getting Started

```bash
npm install
npm run build
```

## Development

```bash
npm run dev:api       # Start API service
npm run dev:worker    # Start worker service
npm run dev:dashboard # Start admin dashboard
```

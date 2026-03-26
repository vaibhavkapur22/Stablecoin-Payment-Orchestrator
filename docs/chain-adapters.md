---
title: Chain Adapters
layout: default
nav_order: 6
---

# Chain Adapters
{: .no_toc }

Blockchain-specific implementations for transaction execution and health monitoring.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

Chain adapters provide a unified interface for interacting with different blockchains. Each adapter implements the `ChainAdapter` interface, allowing the rest of the system to work with any supported chain without knowing the underlying details.

## ChainAdapter Interface

```typescript
interface ChainAdapter {
  readonly chain: Chain;

  validateAddress(address: string): boolean;
  getBalance(address: string): Promise<number>;
  estimateFee(): Promise<number>;
  buildAndSendTransfer(params: {
    to: string;
    amount: number;
    treasuryAddress: string;
  }): Promise<TransactionResult>;
  checkConfirmation(txId: string): Promise<ConfirmationResult>;
  getHealthMetrics(): Promise<HealthMetrics>;
}
```

### Method Reference

| Method | Description |
|:-------|:------------|
| `validateAddress` | Validates the format of a blockchain address |
| `getBalance` | Fetches the USDC balance for an address |
| `estimateFee` | Estimates the current transaction fee in USD |
| `buildAndSendTransfer` | Constructs and broadcasts a USDC transfer |
| `checkConfirmation` | Checks if a transaction has reached finality |
| `getHealthMetrics` | Collects RPC latency, error rate, fee, and congestion data |

### Return Types

```typescript
interface TransactionResult {
  txId: string;
  chain: Chain;
  broadcastAt: Date;
}

interface ConfirmationResult {
  confirmed: boolean;
  confirmations: number;
  finalizedAt: Date | null;
  fee_native: number | null;
}
```

---

## Ethereum Adapter

The Ethereum adapter uses **ethers.js** to interact with Ethereum mainnet.

### Key Details

| Property | Value |
|:---------|:------|
| Library | ethers.js v6 |
| Token | USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) |
| Decimals | 6 |
| Fee estimation | `provider.getFeeData()` converted to USD |
| Confirmations required | Based on provider finality |

### Nonce Management

Ethereum transactions require sequential nonces. The adapter uses a **Redis-backed nonce manager** to handle concurrent transactions safely:

1. Fetches the current on-chain nonce
2. Acquires a Redis lock for the treasury address
3. Increments and assigns the nonce atomically
4. Releases the lock after broadcast

This prevents nonce conflicts when multiple payments are being processed simultaneously.

### Configuration

| Environment Variable | Description |
|:---------------------|:------------|
| `ETH_RPC_URL` | Primary Ethereum RPC endpoint |
| `ETH_RPC_URL_FALLBACK` | Fallback RPC endpoint |
| `ETH_TREASURY_PRIVATE_KEY` | Treasury wallet private key |
| `ETH_USDC_CONTRACT` | USDC token contract address |

---

## Solana Adapter

The Solana adapter uses **@solana/web3.js** and **@solana/spl-token** for SPL token transfers.

### Key Details

| Property | Value |
|:---------|:------|
| Library | @solana/web3.js |
| Token | USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) |
| Decimals | 6 |
| Transfer method | SPL Token transfer instruction |
| Fee estimation | Based on recent transaction fees |

### Configuration

| Environment Variable | Description |
|:---------------------|:------------|
| `SOL_RPC_URL` | Primary Solana RPC endpoint |
| `SOL_RPC_URL_FALLBACK` | Fallback RPC endpoint |
| `SOL_TREASURY_PRIVATE_KEY` | Treasury wallet private key (base58) |
| `SOL_USDC_MINT` | USDC SPL token mint address |

---

## Adding a New Chain

To add support for a new blockchain:

1. **Create a new adapter** in `packages/chain-adapters/src/<chain>/adapter.ts`
2. **Implement the `ChainAdapter` interface** with all required methods
3. **Add the chain** to the `Chain` type in `packages/common/src/types.ts`
4. **Update the database** schema to allow the new chain value in CHECK constraints
5. **Register the adapter** in the worker service's metrics collector
6. **Add treasury wallet** configuration for the new chain

The routing engine will automatically include the new chain in scoring once health snapshots exist for it.

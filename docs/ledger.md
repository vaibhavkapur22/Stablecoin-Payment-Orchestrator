---
title: Ledger System
layout: default
nav_order: 7
---

# Ledger System
{: .no_toc }

Double-entry accounting for treasury balance tracking and auditability.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

The ledger system provides a complete audit trail of all balance movements across treasury wallets. Every operation that affects a treasury balance creates a corresponding ledger entry, enabling full reconciliation.

## Entry Types

| Type | Trigger | Description |
|:-----|:--------|:------------|
| `reserve` | Payment intent created | Moves funds from available to reserved |
| `debit` | Transaction broadcasted | Records the USDC transfer amount |
| `fee` | Transaction confirmed | Records the actual gas/transaction fee |
| `release` | Payment failed | Returns reserved funds to available |
| `refund` | Payment reversed | Returns debited funds to available |

## Ledger Entry Schema

```typescript
interface LedgerEntry {
  id: string;                    // Unique entry ID (prefixed)
  payment_intent_id: string;     // Associated payment
  type: LedgerEntryType;         // reserve | debit | fee | release | refund
  amount: number;                // Entry amount
  currency: string;              // USDC, ETH, SOL
  chain: Chain;                  // ethereum | solana
  created_at: Date;              // Timestamp
}
```

## Lifecycle Example

For a successful $100 USDC payment via Solana:

| Step | Entry Type | Amount | Currency | Effect |
|:-----|:-----------|:-------|:---------|:-------|
| 1 | `reserve` | 100.00 | USDC | Available: -100, Reserved: +100 |
| 2 | `debit` | 100.00 | USDC | Records transfer execution |
| 3 | `fee` | 0.000005 | SOL | Records actual transaction fee |

For a failed payment:

| Step | Entry Type | Amount | Currency | Effect |
|:-----|:-----------|:-------|:---------|:-------|
| 1 | `reserve` | 100.00 | USDC | Available: -100, Reserved: +100 |
| 2 | `release` | 100.00 | USDC | Available: +100, Reserved: -100 |

## API Functions

| Function | Description |
|:---------|:------------|
| `createLedgerEntry()` | Generic entry creation |
| `reserveBalance()` | Create a reserve entry when payment intent is created |
| `debitBalance()` | Create a debit entry when transaction is broadcasted |
| `recordFee()` | Record actual gas/transaction fee on confirmation |
| `releaseReserve()` | Release reserved balance on payment failure |
| `refund()` | Create a refund entry on payment reversal |
| `getTreasuryNetPosition()` | Aggregate balance state by chain from ledger entries |

## Treasury Balance Model

Treasury wallets track two separate balances:

```
┌─────────────────────────────┐
│     Treasury Wallet         │
│                             │
│  available_balance: 50000   │  ← Funds ready to send
│  reserved_balance:  2000    │  ← Funds locked for pending payments
│                             │
│  total = 52000 USDC         │
└─────────────────────────────┘
```

- **Available balance** decreases when funds are reserved, increases when reserves are released
- **Reserved balance** increases when funds are reserved, decreases when payments settle or fail
- Row-level locking (`SELECT ... FOR UPDATE`) prevents race conditions during concurrent reservations

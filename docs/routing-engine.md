---
title: Routing Engine
layout: default
nav_order: 5
---

# Routing Engine
{: .no_toc }

How the orchestrator selects the optimal blockchain for each payment.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview

The routing engine is the core intelligence of the orchestrator. For each payment, it evaluates all available chains and selects the one that best matches the merchant's priority preference. The engine uses real-time chain health metrics and treasury balance data to make decisions.

## Route Selection Process

```
1. Fetch latest chain health snapshots (one per chain)
2. Fetch treasury wallet balances
3. For each chain, build a RouteMetrics object
4. Score each route using priority-weighted algorithm
5. Disqualify ineligible routes
6. Select the highest-scoring viable route
```

## Scoring Algorithm

Each route is scored on three dimensions, then combined using priority-specific weights.

### Dimensions

| Dimension | Source | Formula |
|:----------|:-------|:--------|
| **Fee Score** | Chain health snapshot | `1 - (fee / max_fee)` |
| **Latency Score** | Chain health snapshot | `1 - (seconds / max_seconds)` |
| **Reliability Score** | Chain health snapshot | `1 - rpc_error_rate` (passthrough) |

All scores are normalized to a **0-1 scale** where higher is better.

### Priority Weights

The `priority` parameter determines how the three dimensions are weighted:

| Priority | Fee Weight | Latency Weight | Reliability Weight |
|:---------|:-----------|:---------------|:-------------------|
| `low_fee` | **60%** | 20% | 20% |
| `fast` | 15% | **65%** | 20% |
| `reliable` | 10% | 15% | **75%** |

### Final Score Calculation

```
final_score = (fee_weight * fee_score) + (latency_weight * latency_score) + (reliability_weight * reliability_score)
```

## Disqualification Rules

A route is disqualified (score = -1) if any of these conditions are true:

| Condition | Reason |
|:----------|:-------|
| No destination address | Merchant didn't provide an address for this chain |
| Insufficient balance | Treasury wallet balance < payment amount |
| Chain unhealthy | Latest health snapshot shows `unhealthy` status |

Disqualified routes are excluded from selection but still appear in debug output.

## Health Status Derivation

The metrics collector determines health status from raw metrics:

| Status | Condition |
|:-------|:----------|
| **unhealthy** | RPC error rate > 30% OR congestion score > 80% |
| **degraded** | RPC error rate > 10% OR congestion score > 50% |
| **healthy** | All metrics within normal range |

{: .note }
`degraded` chains are still eligible for routing but will have lower reliability scores, naturally deprioritizing them.

## Example Scoring

Given a `low_fee` priority payment with both chains healthy:

| Metric | Ethereum | Solana |
|:-------|:---------|:-------|
| Estimated Fee | $1.83 | $0.02 |
| Confirmation Time | 75s | 8s |
| Reliability | 0.98 | 0.95 |

**Normalized scores:**

| Score | Ethereum | Solana |
|:------|:---------|:-------|
| Fee Score | 0.000 | 0.989 |
| Latency Score | 0.000 | 0.893 |
| Reliability Score | 0.980 | 0.950 |

**Final scores with `low_fee` weights (60/20/20):**

| Chain | Calculation | Final Score |
|:------|:------------|:------------|
| Ethereum | 0.60(0.000) + 0.20(0.000) + 0.20(0.980) | **0.196** |
| Solana | 0.60(0.989) + 0.20(0.893) + 0.20(0.950) | **0.962** |

**Selected:** Solana (highest score)

## Debugging Routes

Use the route debug endpoint to inspect the full scoring process for any payment:

```bash
curl http://localhost:3000/routes/debug/pi_xyz789abc012 \
  -H "X-Api-Key: test-api-key"
```

This returns chain health snapshots, treasury balances, individual dimension scores, disqualification reasons, and the final selection.

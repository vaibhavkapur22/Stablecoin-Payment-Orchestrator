# Stablecoin Payment Orchestrator Plan

## Goal

Build a **stablecoin payout/payment orchestrator** that accepts a merchant payment request in USD and dynamically routes a USDC transfer across supported chains based on **cost**, **latency**, and **reliability**.

For the MVP, the best framing is:

> **Custodial stablecoin payout orchestrator**
>
> Given a request, send USDC to the recipient on the best chain.

This is stronger than a simple wallet demo because it demonstrates:

- routing intelligence
- chain abstraction
- execution workflows
- retries and failover
- reconciliation and ledgering
- merchant-facing infra APIs

---

## Product framing

Treat this like **payments infrastructure**, not just a blockchain app.

The system should support:

1. **Quote request**
2. **Route selection**
3. **Payment intent creation**
4. **Transaction execution**
5. **Settlement monitoring**
6. **Retry/failover handling**
7. **Reconciliation**
8. **Merchant webhooks**

Instead of only:

- `POST /pay`

build it more like:

- `POST /quotes`
- `POST /payment_intents`
- `GET /payment_intents/:id`
- `GET /routes/debug/:id`
- `POST /webhooks/test`

---

## MVP scope

### Asset
- USDC only

### Chains
- Ethereum
- Solana

### Sender model
Use a **custodial sender model** first.

The backend owns treasury wallets on each chain and sends funds on behalf of the merchant/application.

This gives you full control over:

- routing
- execution
- failover
- balance reservation
- observability

---

## Core flow

### 1. Merchant asks for a quote

`POST /quotes`

```json
{
  "amount_usd": 100,
  "destination": {
    "ethereum_address": "0xabc...",
    "solana_address": "9xyz..."
  },
  "priority": "low_fee"
}
```

Example response:

```json
{
  "quote_id": "qt_123",
  "amount_usd": 100,
  "candidate_routes": [
    {
      "chain": "solana",
      "estimated_fee_usd": 0.02,
      "estimated_settlement_seconds": 8,
      "reliability_score": 0.94,
      "final_score": 0.91
    },
    {
      "chain": "ethereum",
      "estimated_fee_usd": 1.83,
      "estimated_settlement_seconds": 75,
      "reliability_score": 0.99,
      "final_score": 0.63
    }
  ],
  "recommended_route": "solana",
  "expires_at": "2026-03-24T18:00:00Z"
}
```

### 2. Merchant confirms the payment

`POST /payment_intents`

```json
{
  "quote_id": "qt_123",
  "idempotency_key": "merchant-order-987"
}
```

### 3. Orchestrator executes

Internal flow:

1. lock the request using idempotency key
2. validate quote freshness
3. reserve treasury balance
4. select route
5. build transaction
6. sign transaction
7. broadcast transaction
8. store transaction identifier
9. monitor confirmations/finality
10. mark settled or failed
11. emit webhook
12. write ledger entries

### 4. Merchant receives webhook

```json
{
  "event": "payment.settled",
  "payment_intent_id": "pi_123",
  "chain": "solana",
  "tx_id": "5zW...",
  "settled_at": "2026-03-24T18:00:21Z"
}
```

---

## High-level architecture

### API Layer
Handles:

- auth
- request validation
- idempotency
- rate limiting
- merchant-facing APIs

### Routing Engine
Scores available routes using:

- fee estimate
- latency estimate
- reliability
- chain health
- treasury availability
- policy rules

### Chain Adapters
Separate adapter per chain:

- `EthereumAdapter`
- `SolanaAdapter`

Each adapter should know how to:

- validate addresses
- check balances
- estimate fees
- build transaction
- sign transaction
- broadcast transaction
- monitor confirmation/finality

### Transaction Orchestrator / State Machine
Tracks workflow state:

- created
- quoted
- route_selected
- broadcasted
- pending_confirmation
- settled
- failed
- manual_review

### Chain Monitoring Service
Continuously tracks:

- fee levels
- confirmation/finality behavior
- RPC health
- transaction success rate
- congestion indicators

### Ledger / Reconciliation Layer
Stores internal accounting state separate from onchain state.

### Webhook/Event System
Notifies merchant systems of payment lifecycle events.

### Admin / Debug Dashboard
Displays:

- route decisions
- chain health
- transaction status
- treasury balances
- failures and retries

---

## Data model

### Merchant
- `id`
- `api_key_hash`
- `name`

### Quote
- `id`
- `amount_usd`
- `priority`
- `candidate_routes_json`
- `recommended_chain`
- `expires_at`

### PaymentIntent
- `id`
- `merchant_id`
- `quote_id`
- `idempotency_key`
- `amount_usd`
- `selected_chain`
- `status`
- `destination_address`
- `created_at`

### PaymentAttempt
- `id`
- `payment_intent_id`
- `chain`
- `tx_id`
- `rpc_provider`
- `estimated_fee_usd`
- `actual_fee_native`
- `broadcast_at`
- `confirmed_at`
- `status`
- `failure_reason`

### TreasuryWallet
- `id`
- `chain`
- `address`
- `available_balance`
- `reserved_balance`

### ChainHealthSnapshot
- `id`
- `chain`
- `timestamp`
- `avg_confirmation_seconds`
- `rpc_error_rate`
- `p95_latency_ms`
- `congestion_score`
- `health_status`

### LedgerEntry
- `id`
- `payment_intent_id`
- `type` (`reserve`, `debit`, `fee`, `release`, `refund`)
- `amount`
- `currency`
- `chain`
- `created_at`

---

## Routing design

Do **not** hardcode:

- fast -> Solana
- reliable -> Ethereum

Use a **real-time scoring model** instead.

### Inputs per chain

- estimated fee
- estimated settlement time
- reliability score
- treasury balance availability
- chain health
- policy constraints

### Priorities

Support:

- `low_fee`
- `fast`
- `reliable`

### Example scoring formula

Normalize the metrics into values between 0 and 1:

- `fee_score`
- `latency_score`
- `reliability_score`

Then weight based on requested priority.

For `low_fee`:

```text
final_score = 0.60 * fee_score + 0.20 * latency_score + 0.20 * reliability_score
```

For `fast`:

```text
final_score = 0.15 * fee_score + 0.65 * latency_score + 0.20 * reliability_score
```

For `reliable`:

```text
final_score = 0.10 * fee_score + 0.15 * latency_score + 0.75 * reliability_score
```

Apply hard disqualifiers:

- insufficient balance
- unhealthy chain
- missing destination address
- degraded RPC environment
- policy block

### Example pseudocode

```ts
type RouteMetrics = {
  chain: "ethereum" | "solana";
  feeUsd: number;
  settlementSeconds: number;
  reliability: number;
  hasSufficientBalance: boolean;
  isHealthy: boolean;
};

function scoreRoute(
  route: RouteMetrics,
  priority: "low_fee" | "fast" | "reliable",
  stats: {
    maxFeeUsd: number;
    maxSettlementSeconds: number;
  }
): number {
  if (!route.hasSufficientBalance || !route.isHealthy) return -1;

  const feeScore = 1 - route.feeUsd / Math.max(stats.maxFeeUsd, 0.0001);
  const latencyScore =
    1 - route.settlementSeconds / Math.max(stats.maxSettlementSeconds, 1);
  const reliabilityScore = route.reliability;

  if (priority === "low_fee") {
    return 0.6 * feeScore + 0.2 * latencyScore + 0.2 * reliabilityScore;
  }

  if (priority === "fast") {
    return 0.15 * feeScore + 0.65 * latencyScore + 0.2 * reliabilityScore;
  }

  return 0.1 * feeScore + 0.15 * latencyScore + 0.75 * reliabilityScore;
}
```

---

## Chain metrics collection

Do not make live chain calls directly inside the payment API path for all routing decisions.

Instead:

1. run collector jobs continuously
2. cache recent metrics in Redis/Postgres
3. let the router read from cached snapshots

### Ethereum collector inputs
- gas estimate for ERC-20 transfer
- recent confirmation times
- RPC latency and error rate

### Solana collector inputs
- transfer fee estimate
- recent confirmation/finality time
- RPC latency and error rate
- dropped transaction indicators if available

### Suggested cadence
Update metrics every 10 to 30 seconds.

---

## Execution workflow

Execution should be a workflow/state machine, not a single function call.

### Execution steps

1. receive payment confirmation
2. enforce idempotency
3. re-check quote freshness
4. reserve treasury balance
5. select route
6. build transaction
7. sign transaction
8. broadcast
9. persist transaction metadata
10. monitor settlement threshold
11. mark final outcome
12. emit webhook
13. post ledger entries

### Why reserve balance first
Prevents concurrent requests from overspending the same treasury balance.

---

## Ethereum adapter requirements

Your Ethereum adapter should support:

- ERC-20 USDC transfer construction
- gas estimation
- nonce management
- signing
- broadcasting
- rebroadcast or fee bump logic
- confirmation tracking

### Key production concern: nonce management

If the same treasury wallet sends concurrent transactions, nonces become operationally tricky.

Build:

- a `NonceManager`
- a per-wallet send queue
- replacement transaction logic for stuck pending transactions

This is a major infra engineering signal in interviews.

---

## Solana adapter requirements

Your Solana adapter should support:

- associated token account validation
- USDC SPL token transfer instruction creation
- blockhash freshness handling
- signing
- submit + confirmation tracking

### Key production concern: associated token accounts

On Solana, the destination may need an associated token account for USDC.

For MVP, the cleanest choice is:

- require the destination token account to already exist
- fail clearly if it does not

That keeps the initial scope manageable.

---

## State machine

Recommended lifecycle:

```text
CREATED
  -> QUOTED
  -> ROUTE_SELECTED
  -> BROADCASTING
  -> BROADCASTED
  -> PENDING_CONFIRMATION
  -> SETTLED
  -> FAILED
  -> MANUAL_REVIEW
```

Possible additional states:

- `RETRYING`
- `EXPIRED`
- `CANCELLED`

This state machine makes debugging, retries, and reconciliation much easier.

---

## Failure modes to design for

### 1. Fee spikes after quote selection
- re-check route at execution time
- enforce slippage tolerance
- requote or fail when tolerance is exceeded

### 2. RPC provider outage
- support multiple RPC providers per chain
- fail over automatically

### 3. Broadcast succeeded but response timed out
- reconcile by wallet/nonce/signature
- do not rely only on request response success

### 4. Transaction pending too long
- Ethereum: replacement or fee bump
- Solana: re-sign with fresh blockhash where appropriate

### 5. Treasury insufficiency during concurrency spikes
- reserve balances
- use row-level locking or distributed locks

### 6. Merchant retries same request
- use idempotency key
- return original payment intent

### 7. Webhook delivery fails
- retry with exponential backoff
- sign webhooks

### 8. Chain health degradation
- lower route score
- or hard-disable the chain

These scenarios make the system feel like real payment infra.

---

## Security design

### Wallet security
For MVP:

- use dedicated dev wallets
- never hardcode private keys
- keep keys in a secret manager or protected env setup

Production-style future design:

- signer abstraction
- HSM / MPC / custody integration
- hot wallet transfer limits
- chain-specific risk controls

### API security
- API keys per merchant
- rate limiting
- audit logging
- webhook signature verification

### Risk controls
- destination allowlists
- per-merchant volume caps
- large-transfer manual review
- abnormal behavior detection

---

## Observability

Track metrics such as:

- quote latency
- route distribution by chain
- payment success rate by chain
- p50 / p95 settlement time
- average fees
- RPC error rate
- webhook success rate
- failure reason distribution

Log:

- request id
- merchant id
- payment intent id
- selected route
- tx id
- state transitions

A small admin dashboard makes the project much stronger.

---

## Reconciliation and ledgering

This is one of the most important differentiators.

Keep three separate notions of truth:

1. **blockchain state**
2. **internal payment state**
3. **internal accounting/ledger state**

Example ledger sequence:

1. reserve 100 USDC
2. send 100 USDC
3. record gas/fee cost
4. mark settled
5. release unused reserve if applicable

Without a ledger, you cannot answer important operational questions such as:

- did we over-send?
- what fee did we actually pay?
- what happened after a failure?
- how much treasury is truly available?

---

## Recommended stack

### Backend
- TypeScript
- Node.js
- Fastify or NestJS

### Database / cache
- PostgreSQL
- Redis

### Workflow / jobs
- BullMQ or Temporal

### Blockchain libraries
- Ethereum: `ethers.js` or `viem`
- Solana: `@solana/web3.js` + SPL token libraries

### Infra / tooling
- Docker
- OpenTelemetry
- Prometheus / Grafana (optional but strong)
- basic admin dashboard

### Why TypeScript/Node is a good fit
- excellent Ethereum and Solana SDK support
- easy API + worker architecture
- fast iteration
- matches modern fintech/backend stacks well

---

## Service/module breakdown

Even if deployed together at first, keep module boundaries clean:

- `api-service`
- `routing-engine`
- `chain-adapters`
- `worker-service`
- `metrics-collector`
- `webhook-delivery`
- `admin-dashboard`

---

## Demo scenarios

Your demo should show orchestration behavior, not just “funds moved.”

### Demo 1: low_fee
- system chooses Solana
- shows lower fee and fast settlement

### Demo 2: reliable
- system chooses Ethereum
- because Solana health is degraded in simulated metrics

### Demo 3: failover
- Ethereum RPC intentionally fails
- system retries alternate provider or marks route unhealthy

### Demo 4: idempotency
- same payment request submitted twice
- only one transaction is created

### Demo 5: observability
- dashboard shows route decision, state transitions, and settlement

---

## Extensions after MVP

### A. Cross-chain rebalancing
If treasury is depleted on one chain, rebalance across chains rather than simply failing.

### B. Historical route learning
Use past data to improve:

- fee volatility prediction
- expected settlement time
- expected failure rate

### C. Merchant policy engine
Examples:

- never use Ethereum under $20
- require reliability > 0.97
- prefer Solana unless p95 settlement > 20s

### D. Intent-based routing API
Instead of asking for a chain, let merchants specify:

- settle within 30 seconds
- fee under $0.50
- high reliability

Then let the system decide.

---

## What not to do

- do not start with custom smart contracts
- do not support many chains in v1
- do not mix consumer wallet UX into the initial build
- do not depend on live chain calls for every request path
- do not skip ops, retries, and reconciliation

---

## Interview framing

A strong way to describe the project:

> I built a stablecoin payment orchestration service that abstracts multi-chain USDC routing behind a merchant-friendly API. The core of the system is a routing engine that balances fee, latency, and reliability using real-time chain health metrics, plus a workflow engine for execution, confirmation tracking, retries, and reconciliation.

This signals:

- payments systems thinking
- distributed systems design
- infra abstraction
- operational maturity

---

## Implementation roadmap

### Phase 1
- database schema
- `POST /quotes`
- mocked metrics collector
- routing engine
- route debug endpoint

### Phase 2
- Ethereum adapter
- Solana adapter
- treasury balance checker
- execution worker

### Phase 3
- payment intent state machine
- confirmation monitor
- webhook delivery
- ledger entries

### Phase 4
- multi-RPC failover
- admin dashboard
- reconciliation tooling

### Phase 5
- rebalancing simulation
- smarter route weighting
- merchant policy engine

---

## Best positioning

Position the project as a:

# Stablecoin Payout Orchestrator

This gives you the cleanest architecture because you control:

- treasury
- route selection
- execution
- settlement

Then note in the README that the design generalizes to:

- merchant checkout
- treasury movement
- vendor payouts
- payroll
- cross-border settlement

---

## Suggested repo shape

Possible project name ideas:

- `FluxRoute`
- `StableSwitch`

Suggested repo structure:

```text
stablecoin-orchestrator/
  apps/
    api-service/
    worker-service/
    admin-dashboard/
  packages/
    routing-engine/
    chain-adapters/
    ledger/
    common/
  infra/
    docker/
    migrations/
  docs/
    architecture.md
    api.md
    routing.md
```

---

## Deliverables to include in the repo

- architecture diagram
- API contract
- routing explanation
- failure scenarios
- screenshots of admin dashboard
- example requests/responses
- design tradeoff writeup
- local dev instructions
- demo script

---

## Practical next step

Start with this exact development order:

1. quote API
2. mocked chain metrics collector
3. route scoring engine
4. Postgres schema
5. Ethereum adapter
6. Solana adapter
7. worker-driven execution flow
8. confirmation monitor
9. ledger entries
10. admin dashboard

That sequence gets you to a strong demo quickly while preserving a realistic infra architecture.

-- Merchants
CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  api_key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quotes
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  amount_usd NUMERIC(18, 6) NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low_fee', 'fast', 'reliable')),
  destination_ethereum TEXT,
  destination_solana TEXT,
  candidate_routes JSONB NOT NULL DEFAULT '[]',
  recommended_chain TEXT NOT NULL CHECK (recommended_chain IN ('ethereum', 'solana')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_merchant ON quotes(merchant_id);
CREATE INDEX idx_quotes_expires ON quotes(expires_at);

-- Payment Intents
CREATE TABLE payment_intents (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  idempotency_key TEXT NOT NULL,
  amount_usd NUMERIC(18, 6) NOT NULL,
  selected_chain TEXT NOT NULL CHECK (selected_chain IN ('ethereum', 'solana')),
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN (
    'created', 'quoted', 'route_selected', 'broadcasting', 'broadcasted',
    'pending_confirmation', 'settled', 'failed', 'manual_review',
    'retrying', 'expired', 'cancelled'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, idempotency_key)
);

CREATE INDEX idx_pi_merchant ON payment_intents(merchant_id);
CREATE INDEX idx_pi_status ON payment_intents(status);
CREATE INDEX idx_pi_idempotency ON payment_intents(merchant_id, idempotency_key);

-- Payment Attempts
CREATE TABLE payment_attempts (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana')),
  tx_id TEXT,
  rpc_provider TEXT NOT NULL,
  estimated_fee_usd NUMERIC(18, 6) NOT NULL,
  actual_fee_native NUMERIC(18, 9),
  broadcast_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'broadcasted', 'confirmed', 'failed')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attempts_pi ON payment_attempts(payment_intent_id);
CREATE INDEX idx_attempts_status ON payment_attempts(status);
CREATE INDEX idx_attempts_tx ON payment_attempts(tx_id);

-- Treasury Wallets
CREATE TABLE treasury_wallets (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana')),
  address TEXT NOT NULL UNIQUE,
  available_balance NUMERIC(18, 6) NOT NULL DEFAULT 0,
  reserved_balance NUMERIC(18, 6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_treasury_chain ON treasury_wallets(chain);

-- Chain Health Snapshots
CREATE TABLE chain_health_snapshots (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  avg_confirmation_seconds NUMERIC(10, 2) NOT NULL,
  rpc_error_rate NUMERIC(5, 4) NOT NULL,
  p95_latency_ms INTEGER NOT NULL,
  congestion_score NUMERIC(5, 4) NOT NULL,
  health_status TEXT NOT NULL CHECK (health_status IN ('healthy', 'degraded', 'unhealthy')),
  estimated_fee_usd NUMERIC(18, 6) NOT NULL
);

CREATE INDEX idx_health_chain_ts ON chain_health_snapshots(chain, timestamp DESC);

-- Ledger Entries
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  type TEXT NOT NULL CHECK (type IN ('reserve', 'debit', 'fee', 'release', 'refund')),
  amount NUMERIC(18, 6) NOT NULL,
  currency TEXT NOT NULL,
  chain TEXT NOT NULL CHECK (chain IN ('ethereum', 'solana')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_pi ON ledger_entries(payment_intent_id);
CREATE INDEX idx_ledger_chain ON ledger_entries(chain);
CREATE INDEX idx_ledger_type ON ledger_entries(type);

-- Webhook Events
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  payment_intent_id TEXT NOT NULL REFERENCES payment_intents(id),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_merchant ON webhook_events(merchant_id);
CREATE INDEX idx_webhooks_undelivered ON webhook_events(delivered) WHERE NOT delivered;

-- Seed a test merchant
INSERT INTO merchants (id, api_key_hash, name, webhook_url)
VALUES ('mer_test_merchant_01', 'test_api_key_hash', 'Test Merchant', 'http://localhost:9999/webhooks');

-- Seed treasury wallets (dev balances)
INSERT INTO treasury_wallets (id, chain, address, available_balance, reserved_balance)
VALUES
  ('tw_eth_01', 'ethereum', '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18', 50000, 0),
  ('tw_sol_01', 'solana', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 50000, 0);

-- Seed initial chain health snapshots
INSERT INTO chain_health_snapshots (id, chain, avg_confirmation_seconds, rpc_error_rate, p95_latency_ms, congestion_score, health_status, estimated_fee_usd)
VALUES
  ('chs_eth_01', 'ethereum', 75, 0.01, 250, 0.3, 'healthy', 1.83),
  ('chs_sol_01', 'solana', 8, 0.02, 120, 0.1, 'healthy', 0.02);

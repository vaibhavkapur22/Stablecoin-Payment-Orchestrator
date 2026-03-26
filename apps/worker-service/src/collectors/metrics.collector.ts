import { Chain, query, execute } from '@orchestrator/common';
import { getAdapter } from '@orchestrator/chain-adapters';

const SUPPORTED_CHAINS: Chain[] = ['ethereum', 'solana'];

function deriveHealthStatus(rpcErrorRate: number, congestionScore: number): string {
  if (rpcErrorRate > 0.3 || congestionScore > 0.8) return 'unhealthy';
  if (rpcErrorRate > 0.1 || congestionScore > 0.5) return 'degraded';
  return 'healthy';
}

async function collectMetricsForChain(chain: Chain): Promise<void> {
  try {
    const adapter = getAdapter(chain);
    const metrics = await adapter.getHealthMetrics();

    const healthStatus = deriveHealthStatus(metrics.rpcErrorRate, metrics.congestionScore);

    const id = `chs_${chain}_${Date.now()}`;
    await query(
      `INSERT INTO chain_health_snapshots (id, chain, avg_confirmation_seconds, rpc_error_rate, p95_latency_ms, congestion_score, health_status, estimated_fee_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        chain,
        metrics.avgConfirmationSeconds,
        metrics.rpcErrorRate,
        metrics.p95LatencyMs,
        metrics.congestionScore,
        healthStatus,
        metrics.estimatedFeeUsd,
      ],
    );

    console.log(`[metrics] ${chain}: fee=$${metrics.estimatedFeeUsd.toFixed(4)} health=${healthStatus}`);
  } catch (err: any) {
    console.error(`[metrics] Failed to collect metrics for ${chain}:`, err.message);

    // Insert degraded snapshot on error
    const id = `chs_${chain}_${Date.now()}`;
    await query(
      `INSERT INTO chain_health_snapshots (id, chain, avg_confirmation_seconds, rpc_error_rate, p95_latency_ms, congestion_score, health_status, estimated_fee_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, chain, 999, 1.0, 9999, 1.0, 'unhealthy', 999],
    );
  }
}

export function startMetricsCollector(): NodeJS.Timeout {
  const intervalMs = parseInt(process.env.METRICS_INTERVAL_MS || '15000', 10);

  const interval = setInterval(async () => {
    for (const chain of SUPPORTED_CHAINS) {
      await collectMetricsForChain(chain);
    }
  }, intervalMs);

  // Run immediately on start
  setTimeout(async () => {
    for (const chain of SUPPORTED_CHAINS) {
      await collectMetricsForChain(chain);
    }
  }, 1000);

  console.log(`[metrics] Metrics collector started (interval: ${intervalMs}ms)`);
  return interval;
}

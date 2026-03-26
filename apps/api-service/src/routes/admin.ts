import { FastifyInstance } from 'fastify';
import { query, queryOne } from '@orchestrator/common';

export async function adminRoutes(fastify: FastifyInstance) {
  // Dashboard overview
  fastify.get('/admin/overview', async (request, reply) => {
    const [paymentStats, chainHealth, treasuryBalances, recentPayments] = await Promise.all([
      queryOne<{
        total: string;
        settled: string;
        failed: string;
        pending: string;
        total_volume: string;
      }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'settled') as settled,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status NOT IN ('settled', 'failed', 'cancelled', 'expired')) as pending,
          COALESCE(SUM(amount_usd) FILTER (WHERE status = 'settled'), 0) as total_volume
        FROM payment_intents
      `),
      query(`
        SELECT DISTINCT ON (chain) *
        FROM chain_health_snapshots
        ORDER BY chain, timestamp DESC
      `),
      query('SELECT * FROM treasury_wallets'),
      query(`
        SELECT pi.*, pa.tx_id, pa.chain as attempt_chain
        FROM payment_intents pi
        LEFT JOIN payment_attempts pa ON pa.payment_intent_id = pi.id
        ORDER BY pi.created_at DESC
        LIMIT 20
      `),
    ]);

    return reply.send({
      payments: {
        total: parseInt(paymentStats?.total ?? '0'),
        settled: parseInt(paymentStats?.settled ?? '0'),
        failed: parseInt(paymentStats?.failed ?? '0'),
        pending: parseInt(paymentStats?.pending ?? '0'),
        total_volume_usd: parseFloat(paymentStats?.total_volume ?? '0'),
      },
      chain_health: chainHealth,
      treasury_balances: treasuryBalances,
      recent_payments: recentPayments,
    });
  });

  // Route distribution
  fastify.get('/admin/route-distribution', async (request, reply) => {
    const dist = await query(`
      SELECT selected_chain, COUNT(*) as count, SUM(amount_usd) as volume
      FROM payment_intents
      GROUP BY selected_chain
    `);
    return reply.send(dist);
  });

  // Failure reasons
  fastify.get('/admin/failures', async (request, reply) => {
    const failures = await query(`
      SELECT pa.failure_reason, pa.chain, COUNT(*) as count
      FROM payment_attempts pa
      WHERE pa.status = 'failed' AND pa.failure_reason IS NOT NULL
      GROUP BY pa.failure_reason, pa.chain
      ORDER BY count DESC
      LIMIT 20
    `);
    return reply.send(failures);
  });

  // Update chain health (for demo/simulation)
  fastify.post<{
    Body: {
      chain: string;
      health_status: string;
      estimated_fee_usd?: number;
      avg_confirmation_seconds?: number;
      rpc_error_rate?: number;
    };
  }>('/admin/chain-health', async (request, reply) => {
    const { chain, health_status, estimated_fee_usd, avg_confirmation_seconds, rpc_error_rate } = request.body;

    const id = `chs_${Date.now()}`;
    await query(
      `INSERT INTO chain_health_snapshots (id, chain, health_status, estimated_fee_usd, avg_confirmation_seconds, rpc_error_rate, p95_latency_ms, congestion_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        chain,
        health_status,
        estimated_fee_usd ?? (chain === 'ethereum' ? 1.83 : 0.02),
        avg_confirmation_seconds ?? (chain === 'ethereum' ? 75 : 8),
        rpc_error_rate ?? 0.01,
        250,
        0.3,
      ],
    );

    return reply.status(201).send({ id, chain, health_status });
  });
}

import { Worker, Job } from 'bullmq';
import {
  PaymentIntent,
  PaymentAttempt,
  queryOne,
  query,
  execute,
  getPool,
  attemptId,
} from '@orchestrator/common';
import { getAdapter } from '@orchestrator/chain-adapters';
import { debitBalance, recordFee, releaseReserve } from '@orchestrator/ledger';

interface ExecutionJobData {
  paymentIntentId: string;
}

async function updateStatus(id: string, status: string): Promise<void> {
  await execute(
    'UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id],
  );
}

async function processPayment(job: Job<ExecutionJobData>): Promise<void> {
  const { paymentIntentId } = job.data;
  const logger = console;

  logger.info(`[execution] Processing payment ${paymentIntentId}`);

  // 1. Fetch payment intent
  const pi = await queryOne<PaymentIntent>(
    'SELECT * FROM payment_intents WHERE id = $1',
    [paymentIntentId],
  );

  if (!pi) {
    logger.error(`[execution] Payment intent ${paymentIntentId} not found`);
    return;
  }

  if (pi.status === 'settled' || pi.status === 'cancelled') {
    logger.info(`[execution] Payment ${paymentIntentId} already ${pi.status}, skipping`);
    return;
  }

  const adapter = getAdapter(pi.selected_chain);

  try {
    // 2. Update status to broadcasting
    await updateStatus(paymentIntentId, 'broadcasting');

    // 3. Estimate fee
    const estimatedFee = await adapter.estimateFee();

    // 4. Create payment attempt record
    const attId = attemptId();
    await query(
      `INSERT INTO payment_attempts (id, payment_intent_id, chain, rpc_provider, estimated_fee_usd, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [attId, paymentIntentId, pi.selected_chain, process.env[`${pi.selected_chain.toUpperCase()}_RPC_URL`] || 'default', estimatedFee],
    );

    // 5. Execute transfer
    logger.info(`[execution] Broadcasting on ${pi.selected_chain} to ${pi.destination_address}`);
    const txResult = await adapter.buildAndSendTransfer({
      to: pi.destination_address,
      amount: Number(pi.amount_usd),
      treasuryAddress: '', // adapter uses its own wallet
    });

    // 6. Update attempt with tx_id
    await execute(
      `UPDATE payment_attempts SET tx_id = $1, status = 'broadcasted', broadcast_at = NOW() WHERE id = $2`,
      [txResult.txId, attId],
    );

    // 7. Update payment intent status
    await updateStatus(paymentIntentId, 'broadcasted');
    logger.info(`[execution] Transaction broadcasted: ${txResult.txId}`);

    // 8. Create ledger debit entry
    await debitBalance(paymentIntentId, Number(pi.amount_usd), pi.selected_chain);

    // 9. Enqueue confirmation monitoring
    // The confirmation worker picks this up via polling

  } catch (err: any) {
    logger.error(`[execution] Failed for ${paymentIntentId}:`, err.message);

    // Update status to failed
    await updateStatus(paymentIntentId, 'failed');

    // Record failure in attempt
    await execute(
      `UPDATE payment_attempts SET status = 'failed', failure_reason = $1 WHERE payment_intent_id = $2 AND status = 'pending'`,
      [err.message, paymentIntentId],
    );

    // Release reserved balance
    await releaseReserve(paymentIntentId, Number(pi.amount_usd), pi.selected_chain);

    // Release from treasury
    await execute(
      `UPDATE treasury_wallets SET reserved_balance = reserved_balance - $1, updated_at = NOW() WHERE chain = $2`,
      [pi.amount_usd, pi.selected_chain],
    );

    // Emit failure webhook
    await emitWebhook(pi, 'payment.failed', { error: err.message });

    throw err; // Let BullMQ handle retry
  }
}

async function emitWebhook(
  pi: PaymentIntent,
  eventType: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const id = `wh_${Date.now()}`;
  await query(
    `INSERT INTO webhook_events (id, merchant_id, payment_intent_id, event_type, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      pi.merchant_id,
      pi.id,
      eventType,
      JSON.stringify({
        event: eventType,
        payment_intent_id: pi.id,
        chain: pi.selected_chain,
        amount_usd: pi.amount_usd,
        ...extra,
      }),
    ],
  );
}

export function startExecutionWorker(connection: { host: string; port: number; maxRetriesPerRequest: null }): Worker {
  const worker = new Worker('payment-execution', processPayment, {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  });

  worker.on('completed', (job) => {
    console.log(`[execution] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[execution] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

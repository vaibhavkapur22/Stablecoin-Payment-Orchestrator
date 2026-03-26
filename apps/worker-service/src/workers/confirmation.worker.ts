import {
  PaymentAttempt,
  PaymentIntent,
  query,
  queryOne,
  execute,
} from '@orchestrator/common';
import { getAdapter } from '@orchestrator/chain-adapters';
import { recordFee } from '@orchestrator/ledger';

async function checkConfirmations(): Promise<void> {
  // Find all broadcasted but unconfirmed attempts
  const pendingAttempts = await query<PaymentAttempt & { pi_status: string }>(
    `SELECT pa.*, pi.status as pi_status
     FROM payment_attempts pa
     JOIN payment_intents pi ON pi.id = pa.payment_intent_id
     WHERE pa.status = 'broadcasted' AND pa.tx_id IS NOT NULL`,
  );

  for (const attempt of pendingAttempts) {
    try {
      const adapter = getAdapter(attempt.chain);
      const confirmation = await adapter.checkConfirmation(attempt.tx_id!);

      if (confirmation.confirmed) {
        console.log(`[confirmation] Tx ${attempt.tx_id} confirmed on ${attempt.chain}`);

        // Update attempt
        await execute(
          `UPDATE payment_attempts SET status = 'confirmed', confirmed_at = NOW(), actual_fee_native = $1 WHERE id = $2`,
          [confirmation.fee_native, attempt.id],
        );

        // Update payment intent
        await execute(
          `UPDATE payment_intents SET status = 'settled', updated_at = NOW() WHERE id = $1`,
          [attempt.payment_intent_id],
        );

        // Record fee in ledger
        if (confirmation.fee_native) {
          await recordFee(attempt.payment_intent_id, confirmation.fee_native, attempt.chain);
        }

        // Release reserved balance and deduct from available
        await execute(
          `UPDATE treasury_wallets SET
            reserved_balance = reserved_balance - (SELECT amount_usd FROM payment_intents WHERE id = $1),
            available_balance = available_balance - (SELECT amount_usd FROM payment_intents WHERE id = $1),
            updated_at = NOW()
          WHERE chain = $2`,
          [attempt.payment_intent_id, attempt.chain],
        );

        // Emit settled webhook
        const id = `wh_${Date.now()}`;
        const pi = await queryOne<PaymentIntent>(
          'SELECT * FROM payment_intents WHERE id = $1',
          [attempt.payment_intent_id],
        );

        if (pi) {
          await query(
            `INSERT INTO webhook_events (id, merchant_id, payment_intent_id, event_type, payload)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              id,
              pi.merchant_id,
              pi.id,
              'payment.settled',
              JSON.stringify({
                event: 'payment.settled',
                payment_intent_id: pi.id,
                chain: pi.selected_chain,
                tx_id: attempt.tx_id,
                settled_at: new Date().toISOString(),
              }),
            ],
          );
        }
      } else {
        // Check if stuck too long (> 10 minutes)
        const broadcastAge = attempt.broadcast_at
          ? Date.now() - new Date(attempt.broadcast_at).getTime()
          : 0;

        if (broadcastAge > 10 * 60 * 1000) {
          console.warn(`[confirmation] Tx ${attempt.tx_id} stuck for ${Math.round(broadcastAge / 60000)}m, moving to manual_review`);
          await execute(
            `UPDATE payment_intents SET status = 'manual_review', updated_at = NOW() WHERE id = $1`,
            [attempt.payment_intent_id],
          );
        }
      }
    } catch (err: any) {
      console.error(`[confirmation] Error checking ${attempt.tx_id}:`, err.message);
    }
  }
}

export function startConfirmationWorker(_connection?: unknown): NodeJS.Timeout {
  // Poll every 15 seconds
  const interval = setInterval(async () => {
    try {
      await checkConfirmations();
    } catch (err: any) {
      console.error('[confirmation] Worker error:', err.message);
    }
  }, 15000);

  console.log('[confirmation] Confirmation monitor started (polling every 15s)');
  return interval;
}

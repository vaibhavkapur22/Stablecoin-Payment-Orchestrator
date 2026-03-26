import { WebhookEvent, Merchant, query, queryOne, execute } from '@orchestrator/common';
import crypto from 'crypto';

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function deliverPendingWebhooks(): Promise<void> {
  const pendingEvents = await query<WebhookEvent & { webhook_url: string }>(
    `SELECT we.*, m.webhook_url
     FROM webhook_events we
     JOIN merchants m ON m.id = we.merchant_id
     WHERE we.delivered = FALSE AND we.attempts < 5 AND m.webhook_url IS NOT NULL
     ORDER BY we.created_at ASC
     LIMIT 20`,
  );

  for (const event of pendingEvents) {
    try {
      const payloadStr = JSON.stringify(event.payload);
      const signature = signPayload(payloadStr, process.env.WEBHOOK_SIGNING_SECRET || 'whsec_dev');

      const response = await fetch(event.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Id': event.id,
        },
        body: payloadStr,
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        await execute(
          `UPDATE webhook_events SET delivered = TRUE, attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
          [event.id],
        );
        console.log(`[webhook] Delivered ${event.event_type} for ${event.payment_intent_id}`);
      } else {
        await execute(
          `UPDATE webhook_events SET attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
          [event.id],
        );
        console.warn(`[webhook] Failed to deliver ${event.id}: HTTP ${response.status}`);
      }
    } catch (err: any) {
      await execute(
        `UPDATE webhook_events SET attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
        [event.id],
      );
      console.error(`[webhook] Error delivering ${event.id}:`, err.message);
    }
  }
}

export function startWebhookWorker(_connection?: unknown): NodeJS.Timeout {
  // Poll every 5 seconds
  const interval = setInterval(async () => {
    try {
      await deliverPendingWebhooks();
    } catch (err: any) {
      console.error('[webhook] Worker error:', err.message);
    }
  }, 5000);

  console.log('[webhook] Webhook delivery worker started (polling every 5s)');
  return interval;
}

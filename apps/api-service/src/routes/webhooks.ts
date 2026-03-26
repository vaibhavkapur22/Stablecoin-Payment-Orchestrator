import { FastifyInstance } from 'fastify';
import { query, webhookEventId } from '@orchestrator/common';
import { authMiddleware } from '../middleware/auth';

export async function webhookRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Test webhook delivery
  fastify.post('/webhooks/test', async (request, reply) => {
    const merchant = request.merchant;

    if (!merchant.webhook_url) {
      return reply.status(400).send({ error: 'No webhook URL configured for this merchant' });
    }

    const id = webhookEventId();
    const testPayload = {
      event: 'payment.test',
      payment_intent_id: 'pi_test_000',
      chain: 'ethereum',
      tx_id: '0xtest...',
      settled_at: new Date().toISOString(),
    };

    // Attempt delivery
    try {
      const response = await fetch(merchant.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });

      return reply.send({
        webhook_event_id: id,
        delivered: response.ok,
        status_code: response.status,
        payload: testPayload,
      });
    } catch (err: any) {
      return reply.send({
        webhook_event_id: id,
        delivered: false,
        error: err.message,
        payload: testPayload,
      });
    }
  });
}

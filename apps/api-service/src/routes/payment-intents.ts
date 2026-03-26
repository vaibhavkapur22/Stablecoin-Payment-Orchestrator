import { FastifyInstance } from 'fastify';
import { CreatePaymentIntentRequest, AppError } from '@orchestrator/common';
import {
  createPaymentIntent,
  getPaymentIntent,
} from '../services/payment-intent.service';
import { getRouteDebugInfo } from '../services/route-debug.service';
import { authMiddleware } from '../middleware/auth';
import { Queue } from 'bullmq';
let executionQueue: Queue | null = null;

function getExecutionQueue(): Queue {
  if (!executionQueue) {
    executionQueue = new Queue('payment-execution', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        maxRetriesPerRequest: null,
      },
    });
  }
  return executionQueue;
}

export async function paymentIntentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  // Create payment intent
  fastify.post<{ Body: CreatePaymentIntentRequest }>('/payment_intents', async (request, reply) => {
    const { quote_id, idempotency_key } = request.body;

    if (!quote_id) {
      throw new AppError(400, 'quote_id is required', 'MISSING_QUOTE_ID');
    }
    if (!idempotency_key) {
      throw new AppError(400, 'idempotency_key is required', 'MISSING_IDEMPOTENCY_KEY');
    }

    const result = await createPaymentIntent(request.merchant, request.body);

    // Enqueue execution job
    await getExecutionQueue().add('execute-payment', {
      paymentIntentId: result.payment_intent_id,
    }, {
      jobId: result.payment_intent_id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    return reply.status(201).send(result);
  });

  // Get payment intent
  fastify.get<{ Params: { id: string } }>('/payment_intents/:id', async (request, reply) => {
    const pi = await getPaymentIntent(request.params.id);
    return reply.send(pi);
  });

  // Route debug info
  fastify.get<{ Params: { id: string } }>('/routes/debug/:id', async (request, reply) => {
    const debug = await getRouteDebugInfo(request.params.id);
    return reply.send(debug);
  });
}

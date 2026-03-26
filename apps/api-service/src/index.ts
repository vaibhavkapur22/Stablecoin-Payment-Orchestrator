import Fastify from 'fastify';
import cors from '@fastify/cors';
import { AppError } from '@orchestrator/common';
import { quoteRoutes } from './routes/quotes';
import { paymentIntentRoutes } from './routes/payment-intents';
import { adminRoutes } from './routes/admin';
import { webhookRoutes } from './routes/webhooks';

const PORT = parseInt(process.env.PORT || '3000', 10);

async function start() {
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
  });

  await fastify.register(cors, { origin: true });

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
      });
    }

    fastify.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    });
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Register routes
  await fastify.register(quoteRoutes);
  await fastify.register(paymentIntentRoutes);
  await fastify.register(adminRoutes);
  await fastify.register(webhookRoutes);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API service listening on port ${PORT}`);
}

start().catch((err) => {
  console.error('Failed to start API service:', err);
  process.exit(1);
});

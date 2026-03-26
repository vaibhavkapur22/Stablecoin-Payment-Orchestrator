import { FastifyInstance } from 'fastify';
import { CreateQuoteRequest, AppError } from '@orchestrator/common';
import { createQuote } from '../services/quote.service';
import { authMiddleware } from '../middleware/auth';

export async function quoteRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authMiddleware);

  fastify.post<{ Body: CreateQuoteRequest }>('/quotes', async (request, reply) => {
    const { amount_usd, destination, priority } = request.body;

    if (!amount_usd || amount_usd <= 0) {
      throw new AppError(400, 'amount_usd must be positive', 'INVALID_AMOUNT');
    }

    if (!destination?.ethereum_address && !destination?.solana_address) {
      throw new AppError(400, 'At least one destination address is required', 'MISSING_DESTINATION');
    }

    if (!['low_fee', 'fast', 'reliable'].includes(priority)) {
      throw new AppError(400, 'priority must be low_fee, fast, or reliable', 'INVALID_PRIORITY');
    }

    const quote = await createQuote(request.merchant, request.body);
    return reply.status(201).send(quote);
  });
}

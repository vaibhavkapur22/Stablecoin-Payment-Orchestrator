import { FastifyRequest, FastifyReply } from 'fastify';
import { queryOne, Merchant, AppError } from '@orchestrator/common';
import crypto from 'crypto';

function hashApiKey(key: string): string {
  const salt = process.env.API_KEY_SALT || 'dev-salt';
  return crypto.createHmac('sha256', salt).update(key).digest('hex');
}

declare module 'fastify' {
  interface FastifyRequest {
    merchant: Merchant;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AppError(401, 'Missing API key', 'UNAUTHORIZED');
  }

  const keyHash = hashApiKey(apiKey);
  const merchant = await queryOne<Merchant>(
    'SELECT * FROM merchants WHERE api_key_hash = $1',
    [keyHash],
  );

  if (!merchant) {
    // In dev mode, allow the test merchant with any key
    if (process.env.NODE_ENV !== 'production') {
      const testMerchant = await queryOne<Merchant>(
        'SELECT * FROM merchants WHERE id = $1',
        ['mer_test_merchant_01'],
      );
      if (testMerchant) {
        request.merchant = testMerchant;
        return;
      }
    }
    throw new AppError(401, 'Invalid API key', 'UNAUTHORIZED');
  }

  request.merchant = merchant;
}

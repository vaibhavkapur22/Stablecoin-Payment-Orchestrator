import {
  Quote,
  CreateQuoteRequest,
  CreateQuoteResponse,
  quoteId,
  query,
  queryOne,
  Merchant,
  QuoteNotFoundError,
  QuoteExpiredError,
} from '@orchestrator/common';
import { selectRoute } from '@orchestrator/routing-engine';

const QUOTE_TTL_MINUTES = 5;

export async function createQuote(
  merchant: Merchant,
  req: CreateQuoteRequest,
): Promise<CreateQuoteResponse> {
  const routeResult = await selectRoute(req.amount_usd, req.priority, {
    ethereum_address: req.destination.ethereum_address,
    solana_address: req.destination.solana_address,
  });

  if (!routeResult.recommendedChain) {
    throw new Error('No viable route available');
  }

  const id = quoteId();
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO quotes (id, merchant_id, amount_usd, priority, destination_ethereum, destination_solana, candidate_routes, recommended_chain, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      merchant.id,
      req.amount_usd,
      req.priority,
      req.destination.ethereum_address || null,
      req.destination.solana_address || null,
      JSON.stringify(routeResult.candidateRoutes),
      routeResult.recommendedChain,
      expiresAt,
    ],
  );

  return {
    quote_id: id,
    amount_usd: req.amount_usd,
    candidate_routes: routeResult.candidateRoutes,
    recommended_route: routeResult.recommendedChain,
    expires_at: expiresAt.toISOString(),
  };
}

export async function getQuote(quoteId: string): Promise<Quote> {
  const quote = await queryOne<Quote>('SELECT * FROM quotes WHERE id = $1', [quoteId]);
  if (!quote) throw new QuoteNotFoundError(quoteId);
  return quote;
}

export function validateQuoteFreshness(quote: Quote): void {
  if (new Date(quote.expires_at) < new Date()) {
    throw new QuoteExpiredError(quote.id);
  }
}

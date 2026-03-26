import {
  RouteDebugResponse,
  ChainHealthSnapshot,
  TreasuryWallet,
  query,
  PaymentIntentNotFoundError,
} from '@orchestrator/common';
import { getPaymentIntent } from './payment-intent.service';
import { getQuote } from './quote.service';
import { selectRoute } from '@orchestrator/routing-engine';

export async function getRouteDebugInfo(paymentIntentId: string): Promise<RouteDebugResponse> {
  const pi = await getPaymentIntent(paymentIntentId);
  const quote = await getQuote(pi.id ? (await query<{ quote_id: string }>('SELECT quote_id FROM payment_intents WHERE id = $1', [paymentIntentId]))[0]?.quote_id : '');

  const chainHealth = await query<ChainHealthSnapshot>(
    `SELECT DISTINCT ON (chain) * FROM chain_health_snapshots ORDER BY chain, timestamp DESC`,
  );

  const treasuryBalances = await query<TreasuryWallet>(
    'SELECT * FROM treasury_wallets',
  );

  // Re-run route selection for debug info
  const routeResult = await selectRoute(
    pi.amount_usd,
    quote.priority,
    {
      ethereum_address: quote.destination_ethereum || undefined,
      solana_address: quote.destination_solana || undefined,
    },
  );

  return {
    payment_intent_id: paymentIntentId,
    quote,
    chain_health: chainHealth,
    treasury_balances: treasuryBalances,
    scoring_details: routeResult.scoringDetails,
    selected_chain: pi.selected_chain,
  };
}

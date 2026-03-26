import {
  PaymentIntent,
  PaymentAttempt,
  LedgerEntry,
  Chain,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  PaymentIntentResponse,
  paymentIntentId,
  query,
  queryOne,
  execute,
  getPool,
  Merchant,
  PaymentIntentNotFoundError,
  IdempotencyConflictError,
  InsufficientBalanceError,
  NoViableRouteError,
} from '@orchestrator/common';
import { getEntriesForPayment } from '@orchestrator/ledger';
import { getQuote, validateQuoteFreshness } from './quote.service';

export async function createPaymentIntent(
  merchant: Merchant,
  req: CreatePaymentIntentRequest,
): Promise<CreatePaymentIntentResponse> {
  // Check idempotency — return existing if found
  const existing = await queryOne<PaymentIntent>(
    'SELECT * FROM payment_intents WHERE merchant_id = $1 AND idempotency_key = $2',
    [merchant.id, req.idempotency_key],
  );

  if (existing) {
    return {
      payment_intent_id: existing.id,
      status: existing.status,
      amount_usd: Number(existing.amount_usd),
      selected_chain: existing.selected_chain,
      destination_address: existing.destination_address,
      created_at: new Date(existing.created_at).toISOString(),
    };
  }

  // Validate quote
  const quote = await getQuote(req.quote_id);
  validateQuoteFreshness(quote);

  if (quote.merchant_id !== merchant.id) {
    throw new Error('Quote does not belong to this merchant');
  }

  const selectedChain = quote.recommended_chain;
  const destinationAddress =
    selectedChain === 'ethereum' ? quote.destination_ethereum : quote.destination_solana;

  if (!destinationAddress) {
    throw new NoViableRouteError();
  }

  // Reserve treasury balance (with row-level lock)
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: [treasury] } = await client.query(
      'SELECT * FROM treasury_wallets WHERE chain = $1 FOR UPDATE',
      [selectedChain],
    );

    if (!treasury) {
      throw new InsufficientBalanceError(selectedChain);
    }

    const available = Number(treasury.available_balance) - Number(treasury.reserved_balance);
    if (available < Number(quote.amount_usd)) {
      throw new InsufficientBalanceError(selectedChain);
    }

    // Reserve
    await client.query(
      'UPDATE treasury_wallets SET reserved_balance = reserved_balance + $1, updated_at = NOW() WHERE id = $2',
      [quote.amount_usd, treasury.id],
    );

    // Create payment intent
    const id = paymentIntentId();
    await client.query(
      `INSERT INTO payment_intents (id, merchant_id, quote_id, idempotency_key, amount_usd, selected_chain, destination_address, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'route_selected')`,
      [id, merchant.id, quote.id, req.idempotency_key, quote.amount_usd, selectedChain, destinationAddress],
    );

    // Create reserve ledger entry
    const leId = `le_${Date.now()}`;
    await client.query(
      `INSERT INTO ledger_entries (id, payment_intent_id, type, amount, currency, chain)
       VALUES ($1, $2, 'reserve', $3, 'USDC', $4)`,
      [leId, id, quote.amount_usd, selectedChain],
    );

    await client.query('COMMIT');

    return {
      payment_intent_id: id,
      status: 'route_selected',
      amount_usd: Number(quote.amount_usd),
      selected_chain: selectedChain,
      destination_address: destinationAddress,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPaymentIntent(id: string): Promise<PaymentIntentResponse> {
  const pi = await queryOne<PaymentIntent>(
    'SELECT * FROM payment_intents WHERE id = $1',
    [id],
  );

  if (!pi) throw new PaymentIntentNotFoundError(id);

  const attempts = await query<PaymentAttempt>(
    'SELECT * FROM payment_attempts WHERE payment_intent_id = $1 ORDER BY created_at DESC',
    [id],
  );

  const ledgerEntries = await getEntriesForPayment(id);

  return {
    id: pi.id,
    merchant_id: pi.merchant_id,
    amount_usd: Number(pi.amount_usd),
    status: pi.status,
    selected_chain: pi.selected_chain,
    destination_address: pi.destination_address,
    attempts,
    ledger_entries: ledgerEntries,
    created_at: new Date(pi.created_at).toISOString(),
    updated_at: new Date(pi.updated_at).toISOString(),
  };
}

export async function updatePaymentIntentStatus(
  id: string,
  status: string,
): Promise<void> {
  await execute(
    'UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id],
  );
}

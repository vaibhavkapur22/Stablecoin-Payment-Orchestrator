import {
  Chain,
  LedgerEntry,
  LedgerEntryType,
  ledgerEntryId,
  query,
  queryOne,
} from '@orchestrator/common';

export async function createLedgerEntry(params: {
  paymentIntentId: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  chain: Chain;
}): Promise<LedgerEntry> {
  const id = ledgerEntryId();
  const rows = await query<LedgerEntry>(
    `INSERT INTO ledger_entries (id, payment_intent_id, type, amount, currency, chain)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, params.paymentIntentId, params.type, params.amount, params.currency, params.chain],
  );
  return rows[0];
}

export async function reserveBalance(
  paymentIntentId: string,
  amount: number,
  chain: Chain,
): Promise<LedgerEntry> {
  return createLedgerEntry({
    paymentIntentId,
    type: 'reserve',
    amount,
    currency: 'USDC',
    chain,
  });
}

export async function debitBalance(
  paymentIntentId: string,
  amount: number,
  chain: Chain,
): Promise<LedgerEntry> {
  return createLedgerEntry({
    paymentIntentId,
    type: 'debit',
    amount,
    currency: 'USDC',
    chain,
  });
}

export async function recordFee(
  paymentIntentId: string,
  amount: number,
  chain: Chain,
): Promise<LedgerEntry> {
  return createLedgerEntry({
    paymentIntentId,
    type: 'fee',
    amount,
    currency: chain === 'ethereum' ? 'ETH' : 'SOL',
    chain,
  });
}

export async function releaseReserve(
  paymentIntentId: string,
  amount: number,
  chain: Chain,
): Promise<LedgerEntry> {
  return createLedgerEntry({
    paymentIntentId,
    type: 'release',
    amount,
    currency: 'USDC',
    chain,
  });
}

export async function refund(
  paymentIntentId: string,
  amount: number,
  chain: Chain,
): Promise<LedgerEntry> {
  return createLedgerEntry({
    paymentIntentId,
    type: 'refund',
    amount,
    currency: 'USDC',
    chain,
  });
}

export async function getEntriesForPayment(paymentIntentId: string): Promise<LedgerEntry[]> {
  return query<LedgerEntry>(
    `SELECT * FROM ledger_entries WHERE payment_intent_id = $1 ORDER BY created_at ASC`,
    [paymentIntentId],
  );
}

export async function getTreasuryNetPosition(chain: Chain): Promise<{
  totalReserved: number;
  totalDebited: number;
  totalReleased: number;
  totalRefunded: number;
  totalFees: number;
}> {
  const result = await queryOne<{
    total_reserved: string;
    total_debited: string;
    total_released: string;
    total_refunded: string;
    total_fees: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'reserve' THEN amount ELSE 0 END), 0) as total_reserved,
       COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debited,
       COALESCE(SUM(CASE WHEN type = 'release' THEN amount ELSE 0 END), 0) as total_released,
       COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) as total_refunded,
       COALESCE(SUM(CASE WHEN type = 'fee' THEN amount ELSE 0 END), 0) as total_fees
     FROM ledger_entries
     WHERE chain = $1 AND currency = 'USDC'`,
    [chain],
  );

  return {
    totalReserved: parseFloat(result?.total_reserved ?? '0'),
    totalDebited: parseFloat(result?.total_debited ?? '0'),
    totalReleased: parseFloat(result?.total_released ?? '0'),
    totalRefunded: parseFloat(result?.total_refunded ?? '0'),
    totalFees: parseFloat(result?.total_fees ?? '0'),
  };
}

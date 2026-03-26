// Chain types
export type Chain = 'ethereum' | 'solana';
export type Priority = 'low_fee' | 'fast' | 'reliable';

// Payment intent statuses (state machine)
export type PaymentStatus =
  | 'created'
  | 'quoted'
  | 'route_selected'
  | 'broadcasting'
  | 'broadcasted'
  | 'pending_confirmation'
  | 'settled'
  | 'failed'
  | 'manual_review'
  | 'retrying'
  | 'expired'
  | 'cancelled';

// Ledger entry types
export type LedgerEntryType = 'reserve' | 'debit' | 'fee' | 'release' | 'refund';

// Chain health status
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

// Webhook event types
export type WebhookEventType =
  | 'payment.created'
  | 'payment.broadcasting'
  | 'payment.broadcasted'
  | 'payment.settled'
  | 'payment.failed'
  | 'payment.manual_review';

// --- Data model interfaces ---

export interface Merchant {
  id: string;
  api_key_hash: string;
  name: string;
  webhook_url: string | null;
  created_at: Date;
}

export interface Quote {
  id: string;
  merchant_id: string;
  amount_usd: number;
  priority: Priority;
  destination_ethereum: string | null;
  destination_solana: string | null;
  candidate_routes: CandidateRoute[];
  recommended_chain: Chain;
  expires_at: Date;
  created_at: Date;
}

export interface CandidateRoute {
  chain: Chain;
  estimated_fee_usd: number;
  estimated_settlement_seconds: number;
  reliability_score: number;
  final_score: number;
}

export interface PaymentIntent {
  id: string;
  merchant_id: string;
  quote_id: string;
  idempotency_key: string;
  amount_usd: number;
  selected_chain: Chain;
  destination_address: string;
  status: PaymentStatus;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentAttempt {
  id: string;
  payment_intent_id: string;
  chain: Chain;
  tx_id: string | null;
  rpc_provider: string;
  estimated_fee_usd: number;
  actual_fee_native: number | null;
  broadcast_at: Date | null;
  confirmed_at: Date | null;
  status: 'pending' | 'broadcasted' | 'confirmed' | 'failed';
  failure_reason: string | null;
  created_at: Date;
}

export interface TreasuryWallet {
  id: string;
  chain: Chain;
  address: string;
  available_balance: number;
  reserved_balance: number;
  updated_at: Date;
}

export interface ChainHealthSnapshot {
  id: string;
  chain: Chain;
  timestamp: Date;
  avg_confirmation_seconds: number;
  rpc_error_rate: number;
  p95_latency_ms: number;
  congestion_score: number;
  health_status: HealthStatus;
  estimated_fee_usd: number;
}

export interface LedgerEntry {
  id: string;
  payment_intent_id: string;
  type: LedgerEntryType;
  amount: number;
  currency: string;
  chain: Chain;
  created_at: Date;
}

export interface WebhookEvent {
  id: string;
  merchant_id: string;
  payment_intent_id: string;
  event_type: WebhookEventType;
  payload: Record<string, unknown>;
  delivered: boolean;
  attempts: number;
  last_attempt_at: Date | null;
  created_at: Date;
}

// --- API request/response types ---

export interface CreateQuoteRequest {
  amount_usd: number;
  destination: {
    ethereum_address?: string;
    solana_address?: string;
  };
  priority: Priority;
}

export interface CreateQuoteResponse {
  quote_id: string;
  amount_usd: number;
  candidate_routes: CandidateRoute[];
  recommended_route: Chain;
  expires_at: string;
}

export interface CreatePaymentIntentRequest {
  quote_id: string;
  idempotency_key: string;
}

export interface CreatePaymentIntentResponse {
  payment_intent_id: string;
  status: PaymentStatus;
  amount_usd: number;
  selected_chain: Chain;
  destination_address: string;
  created_at: string;
}

export interface PaymentIntentResponse {
  id: string;
  merchant_id: string;
  amount_usd: number;
  status: PaymentStatus;
  selected_chain: Chain;
  destination_address: string;
  attempts: PaymentAttempt[];
  ledger_entries: LedgerEntry[];
  created_at: string;
  updated_at: string;
}

export interface RouteDebugResponse {
  payment_intent_id: string;
  quote: Quote;
  chain_health: ChainHealthSnapshot[];
  treasury_balances: TreasuryWallet[];
  scoring_details: {
    chain: Chain;
    fee_score: number;
    latency_score: number;
    reliability_score: number;
    final_score: number;
    disqualified: boolean;
    disqualification_reason?: string;
  }[];
  selected_chain: Chain;
}

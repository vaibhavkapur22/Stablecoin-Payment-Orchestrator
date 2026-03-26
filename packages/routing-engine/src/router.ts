import {
  Chain,
  Priority,
  CandidateRoute,
  ChainHealthSnapshot,
  TreasuryWallet,
  query,
} from '@orchestrator/common';
import { RouteMetrics, ScoringDetail, scoreRoute, selectBestRoute } from './scorer';

const SUPPORTED_CHAINS: Chain[] = ['ethereum', 'solana'];

export interface RouteSelectionResult {
  candidateRoutes: CandidateRoute[];
  scoringDetails: ScoringDetail[];
  recommendedChain: Chain | null;
}

export async function selectRoute(
  amountUsd: number,
  priority: Priority,
  destinations: { ethereum_address?: string; solana_address?: string },
): Promise<RouteSelectionResult> {
  // Fetch latest chain health snapshots
  const healthSnapshots = await getLatestHealthSnapshots();
  // Fetch treasury balances
  const treasuryWallets = await getTreasuryBalances();

  // Build route metrics for each chain
  const routeMetrics: RouteMetrics[] = SUPPORTED_CHAINS.map((chain) => {
    const health = healthSnapshots.find((h) => h.chain === chain);
    const treasury = treasuryWallets.find((t) => t.chain === chain);

    const hasAddress = chain === 'ethereum'
      ? !!destinations.ethereum_address
      : !!destinations.solana_address;

    return {
      chain,
      feeUsd: health?.estimated_fee_usd ?? 999,
      settlementSeconds: health?.avg_confirmation_seconds ?? 999,
      reliability: health ? 1 - health.rpc_error_rate : 0,
      hasSufficientBalance: treasury
        ? treasury.available_balance - treasury.reserved_balance >= amountUsd
        : false,
      isHealthy: health?.health_status !== 'unhealthy',
      hasDestinationAddress: hasAddress,
    };
  });

  // Compute stats for normalization
  const maxFeeUsd = Math.max(...routeMetrics.map((r) => r.feeUsd));
  const maxSettlementSeconds = Math.max(...routeMetrics.map((r) => r.settlementSeconds));

  // Score each route
  const scoringDetails = routeMetrics.map((r) =>
    scoreRoute(r, priority, { maxFeeUsd, maxSettlementSeconds }),
  );

  // Select best
  const best = selectBestRoute(scoringDetails);

  // Build candidate routes for API response
  const candidateRoutes: CandidateRoute[] = routeMetrics.map((r, i) => ({
    chain: r.chain,
    estimated_fee_usd: Math.round(r.feeUsd * 100) / 100,
    estimated_settlement_seconds: Math.round(r.settlementSeconds),
    reliability_score: Math.round(r.reliability * 100) / 100,
    final_score: Math.round(scoringDetails[i].final_score * 100) / 100,
  }));

  return {
    candidateRoutes,
    scoringDetails,
    recommendedChain: best?.chain ?? null,
  };
}

async function getLatestHealthSnapshots(): Promise<ChainHealthSnapshot[]> {
  return query<ChainHealthSnapshot>(`
    SELECT DISTINCT ON (chain) *
    FROM chain_health_snapshots
    ORDER BY chain, timestamp DESC
  `);
}

async function getTreasuryBalances(): Promise<TreasuryWallet[]> {
  return query<TreasuryWallet>(`
    SELECT * FROM treasury_wallets
  `);
}

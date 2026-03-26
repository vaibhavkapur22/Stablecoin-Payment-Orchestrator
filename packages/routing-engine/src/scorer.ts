import { Chain, Priority, ChainHealthSnapshot, TreasuryWallet } from '@orchestrator/common';

export interface RouteMetrics {
  chain: Chain;
  feeUsd: number;
  settlementSeconds: number;
  reliability: number;
  hasSufficientBalance: boolean;
  isHealthy: boolean;
  hasDestinationAddress: boolean;
}

export interface ScoringDetail {
  chain: Chain;
  fee_score: number;
  latency_score: number;
  reliability_score: number;
  final_score: number;
  disqualified: boolean;
  disqualification_reason?: string;
}

const WEIGHTS: Record<Priority, { fee: number; latency: number; reliability: number }> = {
  low_fee: { fee: 0.60, latency: 0.20, reliability: 0.20 },
  fast: { fee: 0.15, latency: 0.65, reliability: 0.20 },
  reliable: { fee: 0.10, latency: 0.15, reliability: 0.75 },
};

export function scoreRoute(
  route: RouteMetrics,
  priority: Priority,
  stats: { maxFeeUsd: number; maxSettlementSeconds: number },
): ScoringDetail {
  // Check disqualifiers
  if (!route.hasDestinationAddress) {
    return {
      chain: route.chain,
      fee_score: 0,
      latency_score: 0,
      reliability_score: 0,
      final_score: -1,
      disqualified: true,
      disqualification_reason: 'No destination address provided for this chain',
    };
  }

  if (!route.hasSufficientBalance) {
    return {
      chain: route.chain,
      fee_score: 0,
      latency_score: 0,
      reliability_score: 0,
      final_score: -1,
      disqualified: true,
      disqualification_reason: 'Insufficient treasury balance',
    };
  }

  if (!route.isHealthy) {
    return {
      chain: route.chain,
      fee_score: 0,
      latency_score: 0,
      reliability_score: 0,
      final_score: -1,
      disqualified: true,
      disqualification_reason: 'Chain is unhealthy',
    };
  }

  const feeScore = 1 - route.feeUsd / Math.max(stats.maxFeeUsd, 0.0001);
  const latencyScore = 1 - route.settlementSeconds / Math.max(stats.maxSettlementSeconds, 1);
  const reliabilityScore = route.reliability;

  const w = WEIGHTS[priority];
  const finalScore = w.fee * feeScore + w.latency * latencyScore + w.reliability * reliabilityScore;

  return {
    chain: route.chain,
    fee_score: Math.round(feeScore * 1000) / 1000,
    latency_score: Math.round(latencyScore * 1000) / 1000,
    reliability_score: Math.round(reliabilityScore * 1000) / 1000,
    final_score: Math.round(finalScore * 1000) / 1000,
    disqualified: false,
  };
}

export function selectBestRoute(scoringDetails: ScoringDetail[]): ScoringDetail | null {
  const viable = scoringDetails.filter((s) => !s.disqualified);
  if (viable.length === 0) return null;
  return viable.reduce((best, current) =>
    current.final_score > best.final_score ? current : best,
  );
}

import { Chain } from '@orchestrator/common';

export interface TransactionResult {
  txId: string;
  chain: Chain;
  broadcastAt: Date;
}

export interface ConfirmationResult {
  confirmed: boolean;
  confirmations: number;
  finalizedAt: Date | null;
  fee_native: number | null;
}

export interface ChainAdapter {
  readonly chain: Chain;

  validateAddress(address: string): boolean;
  getBalance(address: string): Promise<number>;
  estimateFee(): Promise<number>;
  buildAndSendTransfer(params: {
    to: string;
    amount: number; // USDC amount (6 decimals)
    treasuryAddress: string;
  }): Promise<TransactionResult>;
  checkConfirmation(txId: string): Promise<ConfirmationResult>;
  getHealthMetrics(): Promise<{
    avgConfirmationSeconds: number;
    rpcErrorRate: number;
    p95LatencyMs: number;
    congestionScore: number;
    estimatedFeeUsd: number;
  }>;
}

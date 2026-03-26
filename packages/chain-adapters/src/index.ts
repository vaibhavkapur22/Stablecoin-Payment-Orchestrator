export { type ChainAdapter, type TransactionResult, type ConfirmationResult } from './adapter';
export { EthereumAdapter } from './ethereum/adapter';
export { SolanaAdapter } from './solana/adapter';
export { NonceManager } from './ethereum/nonce-manager';

import { Chain } from '@orchestrator/common';
import { ChainAdapter } from './adapter';
import { EthereumAdapter } from './ethereum/adapter';
import { SolanaAdapter } from './solana/adapter';

const adapters: Record<Chain, ChainAdapter> = {
  ethereum: new EthereumAdapter(),
  solana: new SolanaAdapter(),
};

export function getAdapter(chain: Chain): ChainAdapter {
  return adapters[chain];
}

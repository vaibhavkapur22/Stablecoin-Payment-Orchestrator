import { ethers } from 'ethers';
import { Chain } from '@orchestrator/common';
import { ChainAdapter, TransactionResult, ConfirmationResult } from '../adapter';
import { NonceManager } from './nonce-manager';

const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const USDC_DECIMALS = 6;

export class EthereumAdapter implements ChainAdapter {
  readonly chain: Chain = 'ethereum';
  private provider: ethers.JsonRpcProvider;
  private fallbackProvider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet;
  private usdcContract: ethers.Contract;
  private nonceManager: NonceManager;

  constructor() {
    const rpcUrl = process.env.ETH_RPC_URL || 'http://localhost:8545';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    if (process.env.ETH_RPC_URL_FALLBACK) {
      this.fallbackProvider = new ethers.JsonRpcProvider(process.env.ETH_RPC_URL_FALLBACK);
    }

    const privateKey = process.env.ETH_TREASURY_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.nonceManager = new NonceManager(this.wallet.address);

    const usdcAddress = process.env.ETH_USDC_CONTRACT || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    this.usdcContract = new ethers.Contract(usdcAddress, USDC_ABI, this.wallet);
  }

  validateAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async getBalance(address: string): Promise<number> {
    const balance = await this.usdcContract.balanceOf(address);
    return Number(ethers.formatUnits(balance, USDC_DECIMALS));
  }

  async estimateFee(): Promise<number> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 0n;
      // ERC-20 transfer typically ~65000 gas
      const gasEstimate = 65000n;
      const feeWei = gasPrice * gasEstimate;
      const feeEth = Number(ethers.formatEther(feeWei));
      // Approximate ETH/USD — in production, use a price feed
      const ethPriceUsd = 3000;
      return feeEth * ethPriceUsd;
    } catch {
      return 5.0; // fallback estimate
    }
  }

  async buildAndSendTransfer(params: {
    to: string;
    amount: number;
    treasuryAddress: string;
  }): Promise<TransactionResult> {
    const amountRaw = ethers.parseUnits(params.amount.toFixed(USDC_DECIMALS), USDC_DECIMALS);

    // Acquire nonce lock
    const acquired = await this.nonceManager.acquireLock();
    if (!acquired) {
      throw new Error('Could not acquire nonce lock — another transaction is in progress');
    }

    try {
      const onChainNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
      const nonce = await this.nonceManager.getAndIncrementNonce(onChainNonce);

      const tx = await this.usdcContract.transfer(params.to, amountRaw, { nonce });
      const receipt = await tx.wait();

      return {
        txId: receipt.hash,
        chain: 'ethereum',
        broadcastAt: new Date(),
      };
    } finally {
      await this.nonceManager.releaseLock();
    }
  }

  async checkConfirmation(txId: string): Promise<ConfirmationResult> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txId);
      if (!receipt) {
        return { confirmed: false, confirmations: 0, finalizedAt: null, fee_native: null };
      }

      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;
      const finalized = confirmations >= 12;

      const feeNative = receipt.gasUsed * (receipt.gasPrice ?? 0n);

      return {
        confirmed: finalized,
        confirmations,
        finalizedAt: finalized ? new Date() : null,
        fee_native: Number(ethers.formatEther(feeNative)),
      };
    } catch {
      return { confirmed: false, confirmations: 0, finalizedAt: null, fee_native: null };
    }
  }

  async getHealthMetrics() {
    const start = Date.now();
    try {
      const [feeData, blockNumber] = await Promise.all([
        this.provider.getFeeData(),
        this.provider.getBlockNumber(),
      ]);
      const latency = Date.now() - start;

      const gasPrice = feeData.gasPrice ?? 0n;
      const feeWei = gasPrice * 65000n;
      const feeEth = Number(ethers.formatEther(feeWei));
      const estimatedFeeUsd = feeEth * 3000;

      return {
        avgConfirmationSeconds: 75,
        rpcErrorRate: 0.01,
        p95LatencyMs: latency * 2,
        congestionScore: Math.min(estimatedFeeUsd / 10, 1),
        estimatedFeeUsd,
      };
    } catch {
      return {
        avgConfirmationSeconds: 120,
        rpcErrorRate: 0.5,
        p95LatencyMs: 5000,
        congestionScore: 1,
        estimatedFeeUsd: 10,
      };
    }
  }
}

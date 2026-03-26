import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { Chain } from '@orchestrator/common';
import { ChainAdapter, TransactionResult, ConfirmationResult } from '../adapter';

const USDC_DECIMALS = 6;

export class SolanaAdapter implements ChainAdapter {
  readonly chain: Chain = 'solana';
  private connection: Connection;
  private fallbackConnection: Connection | null = null;
  private payer: Keypair;
  private usdcMint: PublicKey;

  constructor() {
    const rpcUrl = process.env.SOL_RPC_URL || 'https://api.devnet.solana.com';
    this.connection = new Connection(rpcUrl, 'confirmed');

    if (process.env.SOL_RPC_URL_FALLBACK) {
      this.fallbackConnection = new Connection(process.env.SOL_RPC_URL_FALLBACK, 'confirmed');
    }

    const secretKey = process.env.SOL_TREASURY_PRIVATE_KEY;
    if (secretKey) {
      this.payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(secretKey)));
    } else {
      this.payer = Keypair.generate();
    }

    this.usdcMint = new PublicKey(
      process.env.SOL_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // devnet USDC
    );
  }

  validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const pubkey = new PublicKey(address);
      const ata = await getAssociatedTokenAddress(this.usdcMint, pubkey);
      const account = await getAccount(this.connection, ata);
      return Number(account.amount) / 10 ** USDC_DECIMALS;
    } catch {
      return 0;
    }
  }

  async estimateFee(): Promise<number> {
    try {
      const { feeCalculator } = await this.connection.getRecentBlockhash();
      // Solana fees are minimal — typically 5000 lamports = 0.000005 SOL
      const solPriceUsd = 150;
      return (5000 / 1e9) * solPriceUsd;
    } catch {
      return 0.01;
    }
  }

  async buildAndSendTransfer(params: {
    to: string;
    amount: number;
    treasuryAddress: string;
  }): Promise<TransactionResult> {
    const destination = new PublicKey(params.to);
    const amountRaw = Math.round(params.amount * 10 ** USDC_DECIMALS);

    // Get associated token accounts
    const sourceAta = await getAssociatedTokenAddress(this.usdcMint, this.payer.publicKey);
    const destAta = await getAssociatedTokenAddress(this.usdcMint, destination);

    // Verify destination ATA exists (MVP: require it to already exist)
    try {
      await getAccount(this.connection, destAta);
    } catch {
      throw new Error(
        `Destination associated token account does not exist for ${params.to}. ` +
        `The recipient must have an existing USDC token account.`
      );
    }

    const instruction = createTransferInstruction(
      sourceAta,
      destAta,
      this.payer.publicKey,
      amountRaw,
    );

    const transaction = new Transaction().add(instruction);
    const signature = await sendAndConfirmTransaction(this.connection, transaction, [this.payer]);

    return {
      txId: signature,
      chain: 'solana',
      broadcastAt: new Date(),
    };
  }

  async checkConfirmation(txId: string): Promise<ConfirmationResult> {
    try {
      const status = await this.connection.getSignatureStatus(txId);
      if (!status.value) {
        return { confirmed: false, confirmations: 0, finalizedAt: null, fee_native: null };
      }

      const confirmations = status.value.confirmations ?? 0;
      const finalized = status.value.confirmationStatus === 'finalized';

      // Get transaction fee
      const tx = await this.connection.getTransaction(txId);
      const feeNative = tx ? tx.meta?.fee ?? null : null;

      return {
        confirmed: finalized,
        confirmations,
        finalizedAt: finalized ? new Date() : null,
        fee_native: feeNative ? feeNative / 1e9 : null, // Convert lamports to SOL
      };
    } catch {
      return { confirmed: false, confirmations: 0, finalizedAt: null, fee_native: null };
    }
  }

  async getHealthMetrics() {
    const start = Date.now();
    try {
      const [slot, perf] = await Promise.all([
        this.connection.getSlot(),
        this.connection.getRecentPerformanceSamples(1),
      ]);
      const latency = Date.now() - start;

      const solPriceUsd = 150;
      const estimatedFeeUsd = (5000 / 1e9) * solPriceUsd;

      const txSuccessRate = perf[0]
        ? perf[0].numTransactions / (perf[0].numTransactions + (perf[0] as any).numSlots || 1)
        : 0.95;

      return {
        avgConfirmationSeconds: 8,
        rpcErrorRate: 0.02,
        p95LatencyMs: latency * 2,
        congestionScore: 1 - txSuccessRate,
        estimatedFeeUsd,
      };
    } catch {
      return {
        avgConfirmationSeconds: 30,
        rpcErrorRate: 0.5,
        p95LatencyMs: 5000,
        congestionScore: 1,
        estimatedFeeUsd: 0.05,
      };
    }
  }
}

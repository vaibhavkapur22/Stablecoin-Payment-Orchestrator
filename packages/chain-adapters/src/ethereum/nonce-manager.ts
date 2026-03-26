import { getRedis } from '@orchestrator/common';

export class NonceManager {
  private lockTimeout = 10000; // 10 seconds

  constructor(private walletAddress: string) {}

  private get lockKey(): string {
    return `nonce:lock:${this.walletAddress}`;
  }

  private get nonceKey(): string {
    return `nonce:current:${this.walletAddress}`;
  }

  async acquireLock(): Promise<boolean> {
    const redis = getRedis();
    const result = await redis.set(this.lockKey, '1', 'PX', this.lockTimeout, 'NX');
    return result === 'OK';
  }

  async releaseLock(): Promise<void> {
    const redis = getRedis();
    await redis.del(this.lockKey);
  }

  async getAndIncrementNonce(onChainNonce: number): Promise<number> {
    const redis = getRedis();
    const stored = await redis.get(this.nonceKey);
    const currentNonce = stored ? Math.max(parseInt(stored, 10), onChainNonce) : onChainNonce;
    await redis.set(this.nonceKey, String(currentNonce + 1));
    return currentNonce;
  }

  async resetNonce(nonce: number): Promise<void> {
    const redis = getRedis();
    await redis.set(this.nonceKey, String(nonce));
  }
}

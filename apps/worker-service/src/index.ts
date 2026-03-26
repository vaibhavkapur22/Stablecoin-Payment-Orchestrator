import IORedis from 'ioredis';
import { startExecutionWorker } from './workers/execution.worker';
import { startConfirmationWorker } from './workers/confirmation.worker';
import { startWebhookWorker } from './workers/webhook.worker';
import { startMetricsCollector } from './collectors/metrics.collector';

async function start() {
  const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const bullConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null as null,
  };

  console.log('Starting worker service...');

  // Start all workers
  const executionWorker = startExecutionWorker(bullConnection);
  const confirmationInterval = startConfirmationWorker(redisConnection);
  const webhookInterval = startWebhookWorker(redisConnection);
  const metricsInterval = startMetricsCollector();

  console.log('All workers started.');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down workers...');
    clearInterval(confirmationInterval);
    clearInterval(webhookInterval);
    clearInterval(metricsInterval);
    await executionWorker.close();
    await redisConnection.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start worker service:', err);
  process.exit(1);
});

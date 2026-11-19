// Must stay the first import — pins the process to IST before anything reads the clock.
import './config/timezone';
import { createApp } from './app';
import { env } from '@/config';
import { prisma } from '@/lib/prisma';
import { logger } from '@/utils/logger';
import { initPush } from '@/lib/push';
import { startScheduler, stopScheduler } from '@/jobs/scheduler';

async function bootstrap() {
  // Verify the DB connection before accepting traffic.
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  // Logs whether push (FCM) is enabled; a no-op without Firebase credentials.
  initPush();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
    if (env.SCHEDULER_ENABLED) startScheduler();
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.warn(`${signal} received, shutting down...`);
    await stopScheduler();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Fatal error during startup', err);
  process.exit(1);
});

import { PrismaClient } from '@prisma/client';
import { isDev } from '@/config';

/**
 * Prisma client singleton.
 * In dev, ts-node-dev reloads modules on every save; without this guard we would
 * leak a new PrismaClient (and DB connection pool) on each reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'warn', 'error'] : ['error'],
  });

if (isDev) globalForPrisma.prisma = prisma;

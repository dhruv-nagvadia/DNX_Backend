import { prisma } from '@/lib/prisma';

export interface UpdatePlatformConfigInput {
  orderPickupWindowHours?: number;
  commissionBps?: number;
  gatewayFeeBps?: number;
  gatewayFeeFlatMinor?: number;
  gatewayFeeAboveMinor?: number;
  gatewayFeeCapMinor?: number;
}

/**
 * Single-row table of platform-wide settings. Self-healing: creates the one
 * row with defaults the first time it's read, rather than needing seed data.
 */
async function getConfig() {
  const existing = await prisma.platformConfig.findFirst({ orderBy: { id: 'asc' } });
  if (existing) return existing;
  return prisma.platformConfig.create({ data: {} });
}

/** Only the fields that were sent are changed; the rest keep their values. */
async function updateConfig(input: UpdatePlatformConfigInput) {
  const config = await getConfig();
  return prisma.platformConfig.update({
    where: { id: config.id },
    data: {
      orderPickupWindowHours: input.orderPickupWindowHours,
      commissionBps: input.commissionBps,
      gatewayFeeBps: input.gatewayFeeBps,
      gatewayFeeFlatMinor: input.gatewayFeeFlatMinor,
      gatewayFeeAboveMinor: input.gatewayFeeAboveMinor,
      gatewayFeeCapMinor: input.gatewayFeeCapMinor,
    },
  });
}

export const platformConfigService = { getConfig, updateConfig };

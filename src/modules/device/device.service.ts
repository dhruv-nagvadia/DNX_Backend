import { prisma } from '@/lib/prisma';
import { RegisterDeviceInput } from './device.validation';

/**
 * Registers (or refreshes) a push token for the signed-in user. Tokens are
 * unique per install, so a token already on file — even under another account
 * that previously signed in on the same device — is re-assigned to this user.
 */
async function register(userId: string, input: RegisterDeviceInput) {
  const now = new Date();
  const device = await prisma.deviceToken.upsert({
    where: { token: input.token },
    create: { userId, token: input.token, platform: input.platform, app: input.app },
    update: { userId, platform: input.platform, app: input.app, lastSeenAt: now },
    select: { id: true, platform: true, app: true, createdAt: true, lastSeenAt: true },
  });
  return device;
}

/** Forgets a push token (on sign-out) — only if it belongs to this user. */
async function unregister(userId: string, token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token, userId } });
}

/** All push tokens for a user. */
async function tokensFor(userId: string): Promise<string[]> {
  const rows = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } });
  return rows.map((r) => r.token);
}

/** Drops tokens FCM reported as no longer valid. */
async function removeTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
}

export const deviceService = { register, unregister, tokensFor, removeTokens };

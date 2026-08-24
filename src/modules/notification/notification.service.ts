import { NotificationType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/utils/logger';

const MAX_LIST = 50;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: 'ORDER' | 'BOOKING';
  entityId?: string;
}

/**
 * Fire-and-forget: writes an in-app notification for a user. Never throws — a
 * notification failure must not break the order/booking flow that triggered it.
 */
async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
  } catch (err) {
    logger.error('Failed to create notification', err);
  }
}

/** Recent notifications for a user (newest first). */
async function list(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_LIST,
  });
}

/** How many unread notifications the user has (drives the bell badge). */
async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

/** Marks one notification read (no-op if it isn't the user's). */
async function markRead(userId: string, id: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, userId, isRead: false },
    data: { isRead: true },
  });
}

/** Marks every unread notification for the user read. */
async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
}

/** ₹ formatting from minor units (paise). Trims a trailing ".00". */
export function formatINR(minor: number | null | undefined): string {
  const rupees = (minor ?? 0) / 100;
  const str = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
  return `₹${str}`;
}

export const notificationService = {
  notify,
  list,
  unreadCount,
  markRead,
  markAllRead,
};

import { Notification, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPushEnabled, sendPush } from '@/lib/push';
import { deviceService } from '@/modules/device/device.service';
import { logger } from '@/utils/logger';

const MAX_LIST = 50;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: 'ORDER' | 'BOOKING' | 'REMINDER';
  entityId?: string;
}

/**
 * Fire-and-forget: writes an in-app notification for a user. Never throws — a
 * notification failure must not break the order/booking flow that triggered it.
 */
async function notify(input: NotifyInput): Promise<void> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType,
        entityId: input.entityId,
      },
    });
    // Detached: the push round-trip to FCM must not delay the request that
    // triggered it.
    void push(notification);
  } catch (err) {
    logger.error('Failed to create notification', err);
  }
}

/**
 * Mirrors an in-app notification to every device the recipient is signed in
 * on. A no-op when push isn't configured or they have no devices; dead tokens
 * reported by FCM are pruned. Never throws.
 */
async function push(n: Notification): Promise<void> {
  try {
    if (!isPushEnabled()) return;
    const tokens = await deviceService.tokensFor(n.userId);
    if (tokens.length === 0) return;

    // Data values must be strings; the deep-link ids mirror entityType/entityId.
    const data: Record<string, string> = { notificationId: n.id, type: n.type };
    if (n.entityType && n.entityId) {
      data.entityType = n.entityType;
      data.entityId = n.entityId;
      if (n.entityType === 'BOOKING') data.bookingId = n.entityId;
      else if (n.entityType === 'ORDER') data.orderId = n.entityId;
      else if (n.entityType === 'REMINDER') data.reminderId = n.entityId;
    }
    const badge = await unreadCount(n.userId);
    const dead = await sendPush(tokens, { title: n.title, body: n.body, data, badge });
    await deviceService.removeTokens(dead);
  } catch (err) {
    logger.error('Failed to send push notification', err);
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

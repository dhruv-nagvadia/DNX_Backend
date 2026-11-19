import { BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notificationService } from '@/modules/notification/notification.service';
import { formatDateTimeIST, formatTimeIST } from '@/modules/notification/emailTemplates';
import { logger } from '@/utils/logger';

const HOUR = 60 * 60_000;
const ACTIVE: BookingStatus[] = ['PENDING', 'CONFIRMED'];

const reminderSelect = {
  id: true,
  userId: true,
  status: true,
  startTime: true,
  createdAt: true,
  service: { select: { name: true } },
  provider: { select: { businessName: true } },
} as const;

/**
 * Appointment reminders to the customer, ~24 h and ~1 h before the start.
 * Each is sent at most once per booking time (reminder24hSentAt /
 * reminder1hSentAt, claimed atomically before notifying; a reschedule clears
 * them).
 *
 * - 24 h: only within the first hour after the 24 h mark, and only for
 *   bookings made at least 24 h ahead — a booking made for later today just
 *   gets the 1 h one. (If the server was down for that whole hour, it's skipped.)
 * - 1 h: any time in the last hour before the start.
 */
export async function runBookingReminders(now = new Date()): Promise<number> {
  let sent = 0;

  const dayAhead = await prisma.booking.findMany({
    where: {
      status: { in: ACTIVE },
      reminder24hSentAt: null,
      startTime: {
        gt: new Date(now.getTime() + 23 * HOUR),
        lte: new Date(now.getTime() + 24 * HOUR),
      },
    },
    select: reminderSelect,
  });
  for (const b of dayAhead) {
    if (b.createdAt.getTime() > b.startTime.getTime() - 24 * HOUR) continue;
    const claimed = await prisma.booking.updateMany({
      where: { id: b.id, reminder24hSentAt: null, status: { in: ACTIVE } },
      data: { reminder24hSentAt: now },
    });
    if (claimed.count === 0) continue;
    await notificationService.notify({
      userId: b.userId,
      type: 'BOOKING_REMINDER',
      title: 'Upcoming appointment',
      body:
        `${b.service.name} at ${b.provider.businessName} on ${formatDateTimeIST(b.startTime)}` +
        (b.status === 'PENDING' ? ' — still waiting for the business to confirm' : ''),
      entityType: 'BOOKING',
      entityId: b.id,
    });
    sent += 1;
  }

  const hourAhead = await prisma.booking.findMany({
    where: {
      status: { in: ACTIVE },
      reminder1hSentAt: null,
      startTime: { gt: now, lte: new Date(now.getTime() + HOUR) },
    },
    select: reminderSelect,
  });
  for (const b of hourAhead) {
    const claimed = await prisma.booking.updateMany({
      where: { id: b.id, reminder1hSentAt: null, status: { in: ACTIVE } },
      data: { reminder1hSentAt: now },
    });
    if (claimed.count === 0) continue;
    const mins = Math.max(1, Math.round((b.startTime.getTime() - now.getTime()) / 60_000));
    await notificationService.notify({
      userId: b.userId,
      type: 'BOOKING_REMINDER',
      title: 'Starting soon',
      body:
        `${b.service.name} at ${b.provider.businessName} starts at ${formatTimeIST(b.startTime)} (in ${mins} min)` +
        (b.status === 'PENDING' ? ' — still waiting for the business to confirm' : ''),
      entityType: 'BOOKING',
      entityId: b.id,
    });
    sent += 1;
  }

  if (sent > 0) logger.info(`[scheduler] sent ${sent} appointment reminder(s)`);
  return sent;
}

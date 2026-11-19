import { prisma } from '@/lib/prisma';
import { bookingService } from '@/modules/booking/booking.service';
import { logger } from '@/utils/logger';

// Per tick — a backlog (e.g. after downtime) drains over the next minutes.
const BATCH = 50;

/**
 * Cancels PENDING bookings whose start time has passed without the business
 * confirming them — refunds/notifications as for a provider cancellation
 * (see bookingService.expireUnconfirmed).
 */
export async function runExpireUnconfirmedBookings(now = new Date()): Promise<number> {
  const due = await prisma.booking.findMany({
    where: { status: 'PENDING', startTime: { lte: now } },
    orderBy: { startTime: 'asc' },
    take: BATCH,
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of due) {
    try {
      if (await bookingService.expireUnconfirmed(id)) expired += 1;
    } catch (err) {
      logger.error(`[scheduler] failed to expire booking ${id}`, err);
    }
  }
  if (expired > 0) logger.info(`[scheduler] expired ${expired} unconfirmed booking(s)`);
  return expired;
}

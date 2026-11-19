import { prisma } from '@/lib/prisma';
import { notificationService } from '@/modules/notification/notification.service';
import { formatDateIST } from '@/modules/notification/emailTemplates';
import { reminderService } from '@/modules/reminder/reminder.service';
import { logger } from '@/utils/logger';

const BATCH = 200;
const CATCH_UP_EVERY_MS = 60 * 60_000;
let lastCatchUp = 0;

/**
 * Repeating series only spawn their next occurrence when the customer opens
 * their reminders (reminderService.catchUp). Run it hourly for customers with
 * an overdue repeating reminder so the next occurrence exists — and gets its
 * own "due" notification — even if they haven't opened the app.
 */
async function catchUpRepeatingSeries(now: Date): Promise<void> {
  if (now.getTime() - lastCatchUp < CATCH_UP_EVERY_MS) return;
  lastCatchUp = now.getTime();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const users = await prisma.reminder.findMany({
    where: { status: 'PENDING', repeat: { not: 'NONE' }, dueDate: { lt: today } },
    distinct: ['userId'],
    select: { userId: true },
  });
  for (const { userId } of users) {
    try {
      await reminderService.catchUp(userId);
    } catch (err) {
      logger.error(`[scheduler] reminder catch-up failed for user ${userId}`, err);
    }
  }
}

/**
 * Sends the "reminder due" notification once per occurrence: at 9:00 am India
 * time, `remindDaysBefore` days before the due day (or straight away if that
 * moment has already passed, e.g. a reminder created for tomorrow in the
 * evening). Already-overdue occurrences are skipped — no stale backlog.
 */
export async function runReminderDue(now = new Date()): Promise<number> {
  await catchUpRepeatingSeries(now);

  // Calendar days are India days (timestamps are stored as UTC).
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Reminder"
    WHERE "status" = 'PENDING'
      AND "notifiedAt" IS NULL
      AND date_trunc('day', ("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
          >= date_trunc('day', ${now}::timestamptz AT TIME ZONE 'Asia/Kolkata')
      AND date_trunc('day', ("dueDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
          - make_interval(days => "remindDaysBefore") + interval '9 hours'
          <= ${now}::timestamptz AT TIME ZONE 'Asia/Kolkata'
    ORDER BY "dueDate" ASC
    LIMIT ${BATCH}`;

  let sent = 0;
  for (const { id } of due) {
    const claimed = await prisma.reminder.updateMany({
      where: { id, notifiedAt: null, status: 'PENDING' },
      data: { notifiedAt: now },
    });
    if (claimed.count === 0) continue;
    const r = await prisma.reminder.findUnique({ where: { id } });
    if (!r) continue;
    const days = istDayDiff(now, r.dueDate);
    const when =
      days <= 0
        ? 'today'
        : days === 1
          ? 'tomorrow'
          : `in ${days} days (${formatDateIST(r.dueDate)})`;
    await notificationService.notify({
      userId: r.userId,
      type: 'REMINDER_DUE',
      title: `Reminder: ${r.title}`,
      body: `${r.title} is due ${when}` + (r.note ? ` — ${r.note}` : ''),
      entityType: 'REMINDER',
      entityId: r.id,
    });
    sent += 1;
  }
  if (sent > 0) logger.info(`[scheduler] sent ${sent} reminder-due notification(s)`);
  return sent;
}

const IST_OFFSET_MS = 330 * 60_000; // India has no DST.

/** Whole India calendar days from `from` to `to`. */
function istDayDiff(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + IST_OFFSET_MS) / 86_400_000);
  return day(to) - day(from);
}

import { Prisma, Reminder, ReminderRepeat, ReminderStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';

export interface CreateReminderInput {
  title: string;
  type: string;
  dueDate: string;
  endDate?: string | null;
  repeat: ReminderRepeat;
  remindDaysBefore: number;
  note?: string;
  providerId?: string;
}

export type UpdateReminderInput = Partial<Omit<CreateReminderInput, 'providerId'>> & {
  note?: string | null;
  endDate?: string | null;
};

/** Rolls a due date forward one period for a repeating reminder. */
function advance(date: Date, repeat: ReminderRepeat): Date {
  const d = new Date(date);
  if (repeat === 'DAILY') d.setDate(d.getDate() + 1);
  else if (repeat === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (repeat === 'MONTHLY') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'YEARLY') d.setFullYear(d.getFullYear() + 1);
  return d;
}

/**
 * For a repeating reminder, if the anchor date is in the past, advance it to
 * the next future occurrence. So "started last month, repeat monthly" reminds
 * on the next monthly date rather than showing overdue.
 */
function nextOccurrence(date: Date, repeat: ReminderRepeat): Date {
  if (repeat === 'NONE') return date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let d = new Date(date);
  let guard = 0;
  while (d < today && guard < 4000) {
    d = advance(d, repeat);
    guard += 1;
  }
  return d;
}

type Db = Prisma.TransactionClient | typeof prisma;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The fields a repeating reminder passes on to its next occurrence. */
function nextOccurrenceData(r: Reminder, dueDate: Date): Prisma.ReminderUncheckedCreateInput {
  return {
    userId: r.userId,
    title: r.title,
    type: r.type,
    dueDate,
    endDate: r.endDate,
    repeat: r.repeat,
    remindDaysBefore: r.remindDaysBefore,
    note: r.note,
    providerId: r.providerId,
    previousOccurrenceId: r.id,
  };
}

// A repeating reminder ignored for a very long time shouldn't mint hundreds of
// rows in a single request — the rest are added on the next visit.
const CATCH_UP_LIMIT = 60;

/**
 * A repeating reminder only ever spawned its next occurrence once you answered
 * the current one, so a "daily" reminder you skipped for two days showed just
 * the first missed day. This gives every missed day its own occurrence — up to
 * and including the first one that's due today or later — so each can be
 * answered on its own. Runs when reminders are listed; safe to run repeatedly
 * (a series that is already caught up is left alone).
 */
async function catchUp(userId: string) {
  const today = startOfToday();
  const overdue = await prisma.reminder.findMany({
    where: { userId, status: 'PENDING', repeat: { not: 'NONE' }, dueDate: { lt: today } },
  });
  if (overdue.length === 0) return;

  // Only the newest occurrence of a series continues it; older overdue ones already have a successor.
  const followed = new Set(
    (
      await prisma.reminder.findMany({
        where: { userId, previousOccurrenceId: { not: null } },
        select: { previousOccurrenceId: true },
      })
    ).map((r) => r.previousOccurrenceId),
  );
  const heads = overdue.filter((r) => !followed.has(r.id));
  if (heads.length === 0) return;

  await prisma.$transaction(
    async (tx) => {
      // One catch-up at a time per user, so two requests can't both extend the same series.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      for (const head of heads) {
        // Re-check under the lock: another request (or a response) may have extended it already.
        if (
          await tx.reminder.findFirst({
            where: { previousOccurrenceId: head.id },
            select: { id: true },
          })
        )
          continue;
        let current = head;
        for (let made = 0; current.dueDate < today && made < CATCH_UP_LIMIT; made += 1) {
          const next = advance(current.dueDate, current.repeat);
          if (current.endDate && next > current.endDate) break;
          current = await tx.reminder.create({ data: nextOccurrenceData(current, next) });
        }
      }
    },
    { timeout: 20_000 },
  );
}

/** Every later occurrence of the same series that hasn't been answered yet. */
async function pendingFollowers(db: Db, id: string): Promise<Reminder[]> {
  const found: Reminder[] = [];
  const queue = [id];
  for (let guard = 0; queue.length > 0 && guard < 5000; guard += 1) {
    const next = await db.reminder.findMany({ where: { previousOccurrenceId: queue.shift() } });
    for (const r of next) {
      queue.push(r.id);
      if (r.status === 'PENDING') found.push(r);
    }
  }
  return found;
}

async function create(userId: string, input: CreateReminderInput) {
  return prisma.reminder.create({
    data: {
      userId,
      title: input.title,
      type: input.type,
      dueDate: nextOccurrence(new Date(input.dueDate), input.repeat),
      endDate: input.endDate ? new Date(input.endDate) : null,
      repeat: input.repeat,
      remindDaysBefore: input.remindDaysBefore,
      note: input.note,
      providerId: input.providerId,
    },
  });
}

async function listMine(userId: string) {
  await catchUp(userId);
  return prisma.reminder.findMany({ where: { userId }, orderBy: { dueDate: 'asc' } });
}

async function getOwned(userId: string, id: string) {
  const reminder = await prisma.reminder.findUnique({ where: { id } });
  if (!reminder || reminder.userId !== userId) throw ApiError.notFound('Reminder not found');
  return reminder;
}

async function update(userId: string, id: string, input: UpdateReminderInput) {
  const existing = await getOwned(userId, id);
  const effectiveRepeat = input.repeat ?? existing.repeat;
  const data: Prisma.ReminderUpdateInput = {
    title: input.title,
    type: input.type,
    repeat: input.repeat,
    remindDaysBefore: input.remindDaysBefore,
    note: input.note,
    dueDate: input.dueDate ? nextOccurrence(new Date(input.dueDate), effectiveRepeat) : undefined,
    endDate:
      input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : null,
  };
  const updated = await prisma.reminder.update({ where: { id }, data });

  // Later occurrences that were already created (missed days) must follow the edit.
  if (existing.status === 'PENDING' && existing.repeat !== 'NONE') {
    const followers = await pendingFollowers(prisma, id);
    if (followers.length > 0) {
      const rescheduled =
        (input.dueDate !== undefined && updated.dueDate.getTime() !== existing.dueDate.getTime()) ||
        updated.repeat !== existing.repeat;
      if (rescheduled || updated.repeat === 'NONE') {
        // New dates / cadence (or no longer repeating): drop them — they're regenerated to match if still due.
        await prisma.reminder.deleteMany({ where: { id: { in: followers.map((f) => f.id) } } });
      } else {
        await prisma.reminder.updateMany({
          where: { id: { in: followers.map((f) => f.id) } },
          data: {
            title: updated.title,
            type: updated.type,
            note: updated.note,
            remindDaysBefore: updated.remindDaysBefore,
            endDate: updated.endDate,
          },
        });
      }
    }
  }
  return updated;
}

/**
 * Deleting an unanswered occurrence of a repeating reminder ends the series
 * from there: the later unanswered occurrences go with it, and the one before
 * it is told to stop at this point so it can't create it again.
 */
async function remove(userId: string, id: string) {
  const reminder = await getOwned(userId, id);
  if (reminder.status === 'PENDING' && reminder.repeat !== 'NONE') {
    const followers = await pendingFollowers(prisma, id);
    if (followers.length > 0) {
      await prisma.reminder.deleteMany({ where: { id: { in: followers.map((f) => f.id) } } });
    }
    if (reminder.previousOccurrenceId) {
      const previous = await prisma.reminder.findUnique({
        where: { id: reminder.previousOccurrenceId },
      });
      if (previous && previous.status === 'PENDING') {
        const stopAt = new Date(reminder.dueDate.getTime() - 1);
        await prisma.reminder.update({
          where: { id: previous.id },
          data: {
            endDate: previous.endDate && previous.endDate < stopAt ? previous.endDate : stopAt,
          },
        });
      }
    }
  }
  await prisma.reminder.delete({ where: { id } });
  return { id };
}

/**
 * Records Done/Missed for this occurrence. The first time this fires on a
 * repeating reminder, it spawns a fresh row for the next occurrence (this
 * row's own dueDate never changes) — so every past occurrence stays visible
 * with its own individual outcome. Calling this again on an already-responded
 * occurrence (Done ↔ Missed) just updates its status — it never spawns a
 * second next-occurrence.
 */
async function respond(
  userId: string,
  id: string,
  status: Extract<ReminderStatus, 'DONE' | 'MISSED'>,
) {
  const reminder = await getOwned(userId, id);
  const wasPending = reminder.status === 'PENDING';

  const updated = await prisma.reminder.update({
    where: { id },
    data: { status, respondedAt: new Date() },
  });

  if (wasPending && reminder.repeat !== 'NONE') {
    // Missed days already have their own occurrences (see catchUp) — only the
    // newest one of a series needs a next occurrence made when it's answered.
    const hasNext = await prisma.reminder.findFirst({
      where: { previousOccurrenceId: id },
      select: { id: true },
    });
    const next = advance(reminder.dueDate, reminder.repeat);
    if (!hasNext && (!reminder.endDate || next <= reminder.endDate)) {
      await prisma.reminder.create({ data: nextOccurrenceData(reminder, next) });
    }
  }

  return updated;
}

export const reminderService = { create, listMine, update, remove, respond };

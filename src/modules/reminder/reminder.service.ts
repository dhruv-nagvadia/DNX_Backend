import { Prisma, ReminderRepeat } from '@prisma/client';
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
    dueDate: input.dueDate
      ? nextOccurrence(new Date(input.dueDate), effectiveRepeat)
      : undefined,
    endDate:
      input.endDate === undefined ? undefined : input.endDate ? new Date(input.endDate) : null,
  };
  return prisma.reminder.update({ where: { id }, data });
}

async function remove(userId: string, id: string) {
  await getOwned(userId, id);
  await prisma.reminder.delete({ where: { id } });
  return { id };
}

/** Marks done — repeating reminders roll forward (until the end date), one-time complete. */
async function markDone(userId: string, id: string) {
  const reminder = await getOwned(userId, id);
  if (reminder.repeat !== 'NONE') {
    const next = advance(reminder.dueDate, reminder.repeat);
    // Past the end date → stop repeating and complete it.
    if (!reminder.endDate || next <= reminder.endDate) {
      return prisma.reminder.update({
        where: { id },
        data: { dueDate: next, completedAt: null },
      });
    }
  }
  return prisma.reminder.update({ where: { id }, data: { completedAt: new Date() } });
}

export const reminderService = { create, listMine, update, remove, markDone };

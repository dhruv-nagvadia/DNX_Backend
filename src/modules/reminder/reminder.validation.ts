import { z } from 'zod';

const TYPES = ['vehicle', 'insurance', 'health', 'document', 'home', 'appointment', 'other'] as const;
const REPEATS = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;

export const createReminderSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120),
    type: z.enum(TYPES).default('other'),
    dueDate: z.string().datetime({ message: 'dueDate must be an ISO datetime' }),
    endDate: z.string().datetime().nullable().optional(),
    repeat: z.enum(REPEATS).default('NONE'),
    remindDaysBefore: z.coerce.number().int().min(0).max(365).default(1),
    note: z.string().max(500).optional(),
    providerId: z.string().optional(),
  }),
});

export const updateReminderSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120).optional(),
    type: z.enum(TYPES).optional(),
    dueDate: z.string().datetime().optional(),
    endDate: z.string().datetime().nullable().optional(),
    repeat: z.enum(REPEATS).optional(),
    remindDaysBefore: z.coerce.number().int().min(0).max(365).optional(),
    note: z.string().max(500).nullable().optional(),
  }),
});

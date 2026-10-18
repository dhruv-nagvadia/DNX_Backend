import { z } from 'zod';

export const blockUserSchema = z.object({
  body: z.object({
    reason: z.string().max(300).optional(),
  }),
});

export const createPenaltySchema = z.object({
  body: z.object({
    amountMinor: z.coerce.number().int().positive(),
    reason: z.string().min(1).max(300),
    note: z.string().max(500).optional(),
  }),
});

export const updatePenaltyStatusSchema = z.object({
  body: z.object({
    status: z.enum(['PAID', 'WAIVED']),
  }),
});

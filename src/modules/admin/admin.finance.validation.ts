import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const financeRangeSchema = z.object({
  query: z.object({
    from: ymd.optional(),
    to: ymd.optional(),
    groupBy: z.enum(['day', 'month']).optional(),
  }),
});

export const setBusinessCommissionSchema = z.object({
  body: z.object({
    // null clears the override so the business follows the platform default.
    commissionBps: z.coerce.number().int().min(0).max(5000).nullable(),
  }),
});

export const recordPayoutSchema = z.object({
  body: z.object({
    userId: z.string().min(1),
    direction: z.enum(['TO_PROVIDER', 'FROM_PROVIDER']).default('TO_PROVIDER'),
    amountMinor: z.coerce.number().int().positive().max(1_000_000_000),
    method: z.string().trim().max(40).optional(),
    reference: z.string().trim().max(120).optional(),
    note: z.string().trim().max(500).optional(),
    paidAt: z.coerce.date().optional(),
  }),
});

const filters = {
  from: ymd.optional(),
  to: ymd.optional(),
  businessId: z.string().min(1).optional(),
  serviceId: z.string().min(1).optional(),
  // A provider account (owner of one or more businesses).
  ownerId: z.string().min(1).optional(),
  method: z.enum(['ONLINE', 'CASH', 'PARTIAL']).optional(),
  kind: z.enum(['BOOKING', 'ORDER']).optional(),
  // OPEN = pending / confirmed / ready.
  status: z
    .enum(['OPEN', 'PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    .optional(),
  search: z.string().trim().max(100).optional(),
};

export const transactionsQuerySchema = z.object({
  query: z.object({
    ...filters,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

export const breakdownQuerySchema = z.object({
  query: z.object({
    ...filters,
    by: z.enum(['business', 'service']).default('business'),
  }),
});

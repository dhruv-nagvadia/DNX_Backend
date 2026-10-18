import { z } from 'zod';

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const earningsQuerySchema = z.object({
  query: z.object({
    from: ymd.optional(),
    to: ymd.optional(),
    businessId: z.string().min(1).optional(),
  }),
});

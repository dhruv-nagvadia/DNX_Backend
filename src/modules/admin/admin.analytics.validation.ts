import { z } from 'zod';

export const growthQuerySchema = z.object({
  query: z.object({
    groupBy: z.enum(['day', 'month', 'year']).default('day'),
  }),
});

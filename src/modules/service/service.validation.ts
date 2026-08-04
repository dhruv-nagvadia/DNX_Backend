import { z } from 'zod';

export const createServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0),
    durationMin: z.coerce.number().int().min(1).max(1440),
    currency: z.string().optional(),
  }),
});

export const updateServiceSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0).optional(),
    durationMin: z.coerce.number().int().min(1).max(1440).optional(),
    isActive: z.boolean().optional(),
  }),
});

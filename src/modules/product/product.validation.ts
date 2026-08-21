import { z } from 'zod';

const measure = z.enum(['weight', 'volume', 'count']);

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().max(1000).optional(),
    measure: measure.optional(),
    price: z.coerce.number().min(0),
    priceQty: z.coerce.number().positive().optional(),
    stockQty: z.coerce.number().min(0).optional(),
    stepQty: z.coerce.number().positive().optional(),
    section: z.string().max(60).optional(),
    imageUrl: z.string().url().optional(),
    currency: z.string().optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().max(1000).optional(),
    measure: measure.optional(),
    price: z.coerce.number().min(0).optional(),
    priceQty: z.coerce.number().positive().optional(),
    stockQty: z.coerce.number().min(0).optional(),
    stepQty: z.coerce.number().positive().optional(),
    section: z.string().max(60).optional(),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  }),
});

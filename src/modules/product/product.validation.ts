import { z } from 'zod';

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0),
    unit: z.string().max(30).optional(),
    section: z.string().max(60).optional(),
    stockQty: z.coerce.number().int().min(0).optional(),
    imageUrl: z.string().url().optional(),
    currency: z.string().optional(),
  }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    description: z.string().max(1000).optional(),
    price: z.coerce.number().min(0).optional(),
    unit: z.string().max(30).optional(),
    section: z.string().max(60).optional(),
    stockQty: z.coerce.number().int().min(0).optional(),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  }),
});

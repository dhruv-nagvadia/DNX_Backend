import { z } from 'zod';

export const replaceCartSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          // Amount in base units (e.g. grams).
          quantity: z.coerce.number().positive(),
        }),
      )
      .default([]),
  }),
});

import { z } from 'zod';

export const createReviewSchema = z.object({
  body: z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  }),
});

// Provider replies to a customer's review. An empty/blank reply removes it.
export const replyToReviewSchema = z.object({
  body: z.object({
    reply: z.string().max(1000).trim().optional(),
  }),
});

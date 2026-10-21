import { z } from 'zod';

const reason = z.string().trim().max(300).optional();

export const blockReasonSchema = z.object({
  body: z.object({ reason }),
});

export const disableCodSchema = z.object({
  body: z.object({ reason }),
});

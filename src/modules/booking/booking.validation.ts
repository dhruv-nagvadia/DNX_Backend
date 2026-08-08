import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    serviceId: z.string().min(1),
    startTime: z.string().datetime({ message: 'startTime must be an ISO datetime' }),
    notes: z.string().max(500).optional(),
  }),
});

import { z } from 'zod';

export const paymentBookingSchema = z.object({
  body: z.object({
    bookingId: z.string().min(1),
  }),
});

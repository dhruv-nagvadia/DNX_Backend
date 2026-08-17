import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    serviceId: z.string().min(1),
    startTime: z.string().datetime({ message: 'startTime must be an ISO datetime' }),
    notes: z.string().max(500).optional(),
    paymentMethod: z.enum(['ONLINE', 'CASH', 'PARTIAL']).default('ONLINE'),
  }),
});

export const rescheduleBookingSchema = z.object({
  body: z.object({
    startTime: z.string().datetime({ message: 'startTime must be an ISO datetime' }),
  }),
});

// Provider-driven status changes only (customers use the cancel route).
export const updateBookingStatusSchema = z.object({
  body: z.object({
    status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']),
    // Optional reason, stored when cancelling and shown to the customer.
    reason: z.string().max(500).optional(),
  }),
});

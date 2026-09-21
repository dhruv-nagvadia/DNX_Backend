import { z } from 'zod';

export const createBookingSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    serviceId: z.string().min(1),
    startTime: z.string().datetime({ message: 'startTime must be an ISO datetime' }),
    notes: z.string().max(500).optional(),
    paymentMethod: z.enum(['ONLINE', 'CASH', 'PARTIAL']).default('ONLINE'),
    // Optional discount code applied at booking.
    couponCode: z.string().trim().max(24).optional(),
    // Required when the selected service is on-location (Service.travelRequired).
    // Coordinates are optional — a saved address may not have any (best-effort
    // server-side geocoding can fail) — the travel fee then falls back to the
    // flat base fee only, with no per-km component.
    serviceAddress: z
      .object({
        line: z.string().min(1).max(300),
        latitude: z.coerce.number().min(-90).max(90).optional(),
        longitude: z.coerce.number().min(-180).max(180).optional(),
      })
      .optional(),
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

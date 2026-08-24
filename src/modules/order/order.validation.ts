import { z } from 'zod';

export const createOrderSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          // Amount in base units (e.g. grams). Fractional allowed.
          quantity: z.coerce.number().positive(),
        }),
      )
      .min(1, 'Your cart is empty'),
    // Pickup orders: pay online now, a partial deposit, or cash at pickup.
    paymentMethod: z.enum(['ONLINE', 'CASH', 'PARTIAL']).default('ONLINE'),
    note: z.string().max(500).optional(),
  }),
});

// Provider-driven status changes (customers use the cancel route).
export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(['CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED']),
  }),
});

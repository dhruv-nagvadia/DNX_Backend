import { z } from 'zod';

export const paymentBookingSchema = z.object({
  body: z.object({
    bookingId: z.string().min(1),
  }),
});

export const paymentOrderSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
  }),
});

export const paymentVerifyBookingSchema = z.object({
  body: z.object({
    bookingId: z.string().min(1),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});

export const paymentVerifyOrderSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});

// Pay-then-place cart checkout — same cart shape as creating an order
// directly, since no order exists yet when checkout starts.
export const orderCheckoutStartSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.coerce.number().positive(),
        }),
      )
      .min(1, 'Your cart is empty'),
    paymentMethod: z.enum(['ONLINE', 'PARTIAL']),
    note: z.string().max(500).optional(),
    couponCode: z.string().trim().max(24).optional(),
  }),
});

export const orderCheckoutConfirmSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});

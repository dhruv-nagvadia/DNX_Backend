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

// Pay-then-place cart checkout — no order exists yet when checkout starts.
// A cart can hold items from several stores and is paid for ONCE: send
// { paymentMethod, groups: [{ providerId, items, couponCode? }, …] }. The older
// single-store body ({ providerId, items, paymentMethod }) is still accepted.
const checkoutGroup = z.object({
  providerId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      }),
    )
    .min(1, 'Your cart is empty'),
  note: z.string().max(500).optional(),
  couponCode: z.string().trim().max(24).optional(),
});
const checkoutMethod = z.enum(['ONLINE', 'PARTIAL']);

export const orderCheckoutStartSchema = z.object({
  body: z.union([
    z.object({
      paymentMethod: checkoutMethod,
      groups: z
        .array(checkoutGroup)
        .min(1, 'Your cart is empty')
        .max(10, 'Too many stores in one checkout'),
    }),
    checkoutGroup.extend({ paymentMethod: checkoutMethod }),
  ]),
});

export const orderCheckoutConfirmSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1),
    razorpaySignature: z.string().min(1),
  }),
});

export const orderCheckoutSyncSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string().min(1),
  }),
});

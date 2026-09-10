import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { paymentController } from './payment.controller';
import {
  paymentBookingSchema,
  paymentOrderSchema,
  paymentVerifyBookingSchema,
  paymentVerifyOrderSchema,
  orderCheckoutStartSchema,
  orderCheckoutConfirmSchema,
} from './payment.validation';

/** Customer payment actions. Mounted at /customer/payments — USER only. */
export const paymentRoutes = Router();
paymentRoutes.use(requireAuth, requireRole(Role.USER));
paymentRoutes.post('/link', validate(paymentBookingSchema), paymentController.createLink);
paymentRoutes.post('/simulate', validate(paymentBookingSchema), paymentController.simulate);
paymentRoutes.post('/verify', validate(paymentVerifyBookingSchema), paymentController.verify);
paymentRoutes.post('/sync', validate(paymentBookingSchema), paymentController.sync);

// Store orders (same shape, different resource).
paymentRoutes.post('/orders/link', validate(paymentOrderSchema), paymentController.createOrderLink);
paymentRoutes.post(
  '/orders/simulate',
  validate(paymentOrderSchema),
  paymentController.simulateOrder,
);
paymentRoutes.post(
  '/orders/verify',
  validate(paymentVerifyOrderSchema),
  paymentController.verifyOrder,
);
paymentRoutes.post('/orders/sync', validate(paymentOrderSchema), paymentController.syncOrder);

// Pay-then-place cart checkout — the order is created only once payment is confirmed.
paymentRoutes.post(
  '/orders/checkout',
  validate(orderCheckoutStartSchema),
  paymentController.startCheckout,
);
paymentRoutes.post(
  '/orders/checkout/confirm',
  validate(orderCheckoutConfirmSchema),
  paymentController.confirmCheckout,
);

/** Public Razorpay webhook. Mounted at /payments. */
export const paymentWebhookRoutes = Router();
paymentWebhookRoutes.post('/webhook', paymentController.webhook);

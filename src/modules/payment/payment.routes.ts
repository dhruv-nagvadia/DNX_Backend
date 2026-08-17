import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { paymentController } from './payment.controller';
import { paymentBookingSchema } from './payment.validation';

/** Customer payment actions. Mounted at /customer/payments — USER only. */
export const paymentRoutes = Router();
paymentRoutes.use(requireAuth, requireRole(Role.USER));
paymentRoutes.post('/link', validate(paymentBookingSchema), paymentController.createLink);
paymentRoutes.post('/simulate', validate(paymentBookingSchema), paymentController.simulate);
paymentRoutes.post('/sync', validate(paymentBookingSchema), paymentController.sync);

/** Public Razorpay webhook. Mounted at /payments. */
export const paymentWebhookRoutes = Router();
paymentWebhookRoutes.post('/webhook', paymentController.webhook);

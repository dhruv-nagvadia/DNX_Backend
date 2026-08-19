import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { customerController } from './customer.controller';
import { listProviderSchema } from '@/modules/provider/provider.validation';
import { bookingRoutes } from '@/modules/booking/booking.routes';
import { orderRoutes } from '@/modules/order/order.routes';
import { reminderRoutes } from '@/modules/reminder/reminder.routes';
import { paymentRoutes } from '@/modules/payment/payment.routes';
import { reviewController } from '@/modules/review/review.controller';
import { authController } from '@/modules/auth/auth.controller';
import { loginSchema, registerSchema } from '@/modules/auth/auth.validation';

/**
 * Customer-facing API (used by the mobile app).
 * Auth here creates/authenticates CUSTOMER (USER) accounts only.
 */
export const customerRoutes = Router();

// Customer auth (public)
customerRoutes.post('/auth/register', validate(registerSchema), authController.registerCustomer);
customerRoutes.post('/auth/login', validate(loginSchema), authController.loginCustomer);

// Public discovery
customerRoutes.get('/providers', validate(listProviderSchema), customerController.listProviders);
customerRoutes.get('/providers/:id/booked-slots', customerController.bookedSlots);
customerRoutes.get('/providers/:id/reviews', reviewController.listPublic);
customerRoutes.get('/providers/:id', customerController.getProvider);

// Bookings (auth handled inside the booking router)
customerRoutes.use('/bookings', bookingRoutes);

// Product orders (auth handled inside the order router)
customerRoutes.use('/orders', orderRoutes);

// Reminders (auth handled inside the reminder router)
customerRoutes.use('/reminders', reminderRoutes);

// Payments (auth handled inside the payment router)
customerRoutes.use('/payments', paymentRoutes);

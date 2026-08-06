import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { customerController } from './customer.controller';
import { listProviderSchema } from '@/modules/provider/provider.validation';
import { bookingRoutes } from '@/modules/booking/booking.routes';
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
customerRoutes.get('/providers/:id', customerController.getProvider);

// Bookings (auth handled inside the booking router)
customerRoutes.use('/bookings', bookingRoutes);

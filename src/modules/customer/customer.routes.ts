import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { customerController } from './customer.controller';
import { listProviderSchema } from '@/modules/provider/provider.validation';
import { bookingRoutes } from '@/modules/booking/booking.routes';

/**
 * Customer-facing API (used by the mobile app).
 * Discovery is public; bookings require a logged-in customer.
 */
export const customerRoutes = Router();

// Public discovery
customerRoutes.get('/providers', validate(listProviderSchema), customerController.listProviders);
customerRoutes.get('/providers/:id', customerController.getProvider);

// Bookings (auth handled inside the booking router)
customerRoutes.use('/bookings', bookingRoutes);

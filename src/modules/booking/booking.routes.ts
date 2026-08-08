import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { bookingController } from './booking.controller';
import { createBookingSchema } from './booking.validation';

/**
 * Customer bookings. Mounted at /customer/bookings — every route needs a
 * logged-in customer (USER).
 */
export const bookingRoutes = Router();
bookingRoutes.use(requireAuth, requireRole(Role.USER));

bookingRoutes.post('/', validate(createBookingSchema), bookingController.create);
bookingRoutes.get('/mine', bookingController.listMine);

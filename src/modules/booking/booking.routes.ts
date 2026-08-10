import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { bookingController } from './booking.controller';
import { createBookingSchema, rescheduleBookingSchema } from './booking.validation';
import { reviewController } from '@/modules/review/review.controller';
import { createReviewSchema } from '@/modules/review/review.validation';

/**
 * Customer bookings. Mounted at /customer/bookings — every route needs a
 * logged-in customer (USER).
 */
export const bookingRoutes = Router();
bookingRoutes.use(requireAuth, requireRole(Role.USER));

bookingRoutes.post('/', validate(createBookingSchema), bookingController.create);
bookingRoutes.get('/mine', bookingController.listMine);
bookingRoutes.patch('/:id/cancel', bookingController.cancel);
bookingRoutes.patch('/:id/reschedule', validate(rescheduleBookingSchema), bookingController.reschedule);
bookingRoutes.post('/:id/review', validate(createReviewSchema), reviewController.create);

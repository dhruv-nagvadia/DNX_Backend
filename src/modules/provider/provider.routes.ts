import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { imageUpload } from '@/middlewares/upload';
import { providerController } from './provider.controller';
import {
  createProviderSchema,
  updateProviderSchema,
  setHoursSchema,
  setDateHourSchema,
  setImagesSchema,
} from './provider.validation';
import { serviceController } from '@/modules/service/service.controller';
import { createServiceSchema, updateServiceSchema } from '@/modules/service/service.validation';
import { productController } from '@/modules/product/product.controller';
import { createProductSchema, updateProductSchema } from '@/modules/product/product.validation';
import { updateBookingStatusSchema } from '@/modules/booking/booking.validation';
import { reviewController } from '@/modules/review/review.controller';
import { authController } from '@/modules/auth/auth.controller';
import { loginSchema, registerSchema } from '@/modules/auth/auth.validation';

/**
 * Provider-facing API (used by the web business dashboard).
 * Mounted at /provider. `:id` is the business id.
 *
 * Provider accounts are independent from customer accounts (separate rows,
 * unique per (email, role)). Auth here only ever creates/authenticates
 * PROVIDER accounts; the business routes require that PROVIDER role.
 */
export const providerRoutes = Router();

// Provider auth (public)
providerRoutes.post('/auth/register', validate(registerSchema), authController.registerProvider);
providerRoutes.post('/auth/login', validate(loginSchema), authController.loginProvider);

// Everything below requires a logged-in PROVIDER.
providerRoutes.use(requireAuth, requireRole(Role.PROVIDER));

// Single-image upload (product photos) — returns the hosted URL.
providerRoutes.post('/uploads/image', imageUpload.single('image'), providerController.uploadImage);

// Home dashboard — bookings across every owned business
providerRoutes.get('/bookings', providerController.listAllBookings);

// Businesses
providerRoutes.get('/businesses', providerController.listMine);
providerRoutes.post('/businesses', validate(createProviderSchema), providerController.create);
providerRoutes.get('/businesses/:id', providerController.getMineOne);
providerRoutes.get('/businesses/:id/bookings', providerController.listBookings);
providerRoutes.patch(
  '/businesses/:id/bookings/:bookingId',
  validate(updateBookingStatusSchema),
  providerController.updateBooking,
);
providerRoutes.post(
  '/businesses/:id/bookings/:bookingId/collect',
  providerController.collectBookingPayment,
);
providerRoutes.get('/businesses/:id/reviews', reviewController.listForOwner);
providerRoutes.patch('/businesses/:id', validate(updateProviderSchema), providerController.update);
providerRoutes.delete('/businesses/:id', providerController.remove);
providerRoutes.put('/businesses/:id/hours', validate(setHoursSchema), providerController.setHours);

// Date-specific hour overrides
providerRoutes.get('/businesses/:id/date-hours', providerController.listDateHours);
providerRoutes.put(
  '/businesses/:id/date-hours',
  validate(setDateHourSchema),
  providerController.setDateHour,
);
providerRoutes.delete('/businesses/:id/date-hours/:date', providerController.deleteDateHour);
providerRoutes.post(
  '/businesses/:id/images',
  imageUpload.array('images', 8),
  providerController.uploadImages,
);
// Reorder / set cover / remove — replaces the ordered gallery list.
providerRoutes.put(
  '/businesses/:id/images',
  validate(setImagesSchema),
  providerController.setImages,
);

// Services within a business
providerRoutes.post(
  '/businesses/:id/services',
  validate(createServiceSchema),
  serviceController.create,
);
providerRoutes.patch(
  '/businesses/:id/services/:serviceId',
  validate(updateServiceSchema),
  serviceController.update,
);
providerRoutes.delete('/businesses/:id/services/:serviceId', serviceController.remove);

// Products within a STORE business (catalog management)
providerRoutes.get('/businesses/:id/products', productController.list);
providerRoutes.post(
  '/businesses/:id/products',
  validate(createProductSchema),
  productController.create,
);
providerRoutes.patch(
  '/businesses/:id/products/:productId',
  validate(updateProductSchema),
  productController.update,
);
providerRoutes.delete('/businesses/:id/products/:productId', productController.remove);

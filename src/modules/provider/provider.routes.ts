import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { imageUpload } from '@/middlewares/upload';
import { providerController } from './provider.controller';
import { createProviderSchema, updateProviderSchema, setHoursSchema } from './provider.validation';
import { serviceController } from '@/modules/service/service.controller';
import { createServiceSchema, updateServiceSchema } from '@/modules/service/service.validation';
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

// Businesses
providerRoutes.get('/businesses', providerController.listMine);
providerRoutes.post('/businesses', validate(createProviderSchema), providerController.create);
providerRoutes.get('/businesses/:id', providerController.getMineOne);
providerRoutes.patch('/businesses/:id', validate(updateProviderSchema), providerController.update);
providerRoutes.put('/businesses/:id/hours', validate(setHoursSchema), providerController.setHours);
providerRoutes.post(
  '/businesses/:id/images',
  imageUpload.array('images', 8),
  providerController.uploadImages,
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

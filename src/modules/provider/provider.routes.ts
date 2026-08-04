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
} from './provider.validation';
import { serviceController } from '@/modules/service/service.controller';
import { createServiceSchema, updateServiceSchema } from '@/modules/service/service.validation';

/**
 * Provider-facing API (used by the web business dashboard).
 * Mounted at /provider — the ENTIRE namespace requires a logged-in PROVIDER.
 * `:id` is the business (provider) id.
 */
export const providerRoutes = Router();
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

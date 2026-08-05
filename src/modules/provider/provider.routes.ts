import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/auth.middleware';
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
 * Mounted at /provider. `:id` is the business (provider) id.
 *
 * Requires a logged-in user, but deliberately NOT the PROVIDER role: one person
 * can be both a customer and a business owner, and forcing the role here would
 * mean a customer had to register a second account to list a business.
 *
 * The real boundary is ownership, not role — every handler below resolves data
 * through the caller's own userId (`listMine`, `getMineById`,
 * `assertOwnedProvider`), so a user can only ever reach their own businesses.
 * Creating a first business promotes USER -> PROVIDER (see provider.service).
 */
export const providerRoutes = Router();
providerRoutes.use(requireAuth);

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

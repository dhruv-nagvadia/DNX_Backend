import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { imageUpload } from '@/middlewares/upload';
import { providerController } from './provider.controller';
import { createProviderSchema, listProviderSchema } from './provider.validation';

export const providerRoutes = Router();

// Public discovery
providerRoutes.get('/', validate(listProviderSchema), providerController.list);

// Provider-only: manage your own business profile.
// NOTE: `/me` routes are declared BEFORE `/:id` so they aren't captured as an id.
providerRoutes.get('/me', requireAuth, requireRole(Role.PROVIDER), providerController.getMine);
providerRoutes.post(
  '/me/images',
  requireAuth,
  requireRole(Role.PROVIDER),
  imageUpload.array('images', 8),
  providerController.uploadImages,
);
providerRoutes.post(
  '/',
  requireAuth,
  requireRole(Role.PROVIDER),
  validate(createProviderSchema),
  providerController.create,
);

// Public provider detail (keep last — greedy param route)
providerRoutes.get('/:id', providerController.getById);
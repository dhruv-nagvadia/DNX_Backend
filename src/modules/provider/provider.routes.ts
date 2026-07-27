import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { imageUpload } from '@/middlewares/upload';
import { providerController } from './provider.controller';
import {
  createProviderSchema,
  listProviderSchema,
  updateProviderSchema,
} from './provider.validation';

export const providerRoutes = Router();
const provider = [requireAuth, requireRole(Role.PROVIDER)] as const;

// Public discovery
providerRoutes.get('/', validate(listProviderSchema), providerController.list);

// Provider-only: manage your own businesses.
// NOTE: `/me` routes are declared BEFORE `/:id` so they aren't captured as an id.
providerRoutes.get('/me', ...provider, providerController.listMine);
providerRoutes.get('/me/:id', ...provider, providerController.getMineOne);
providerRoutes.patch('/me/:id', ...provider, validate(updateProviderSchema), providerController.update);
providerRoutes.post(
  '/me/:id/images',
  ...provider,
  imageUpload.array('images', 8),
  providerController.uploadImages,
);
providerRoutes.post('/', ...provider, validate(createProviderSchema), providerController.create);

// Public provider detail (keep last — greedy param route)
providerRoutes.get('/:id', providerController.getById);

import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { addressController } from './address.controller';
import { createAddressSchema, updateAddressSchema } from './address.validation';

/** Customer saved addresses. Mounted at /customer/addresses — USER only. */
export const addressRoutes = Router();
addressRoutes.use(requireAuth, requireRole(Role.USER));

addressRoutes.get('/', addressController.list);
addressRoutes.post('/', validate(createAddressSchema), addressController.create);
addressRoutes.patch('/:id', validate(updateAddressSchema), addressController.update);
addressRoutes.delete('/:id', addressController.remove);

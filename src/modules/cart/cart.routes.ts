import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { cartController } from './cart.controller';
import { replaceCartSchema } from './cart.validation';

/** Persistent shopping cart. Mounted at /customer/cart — logged-in customers. */
export const cartRoutes = Router();
cartRoutes.use(requireAuth, requireRole(Role.USER));

cartRoutes.get('/', cartController.get);
cartRoutes.put('/', validate(replaceCartSchema), cartController.replace);

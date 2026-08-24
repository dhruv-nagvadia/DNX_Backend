import { Router } from 'express';
import { Role } from '@prisma/client';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { orderController } from './order.controller';
import { createOrderSchema } from './order.validation';

/**
 * Customer product orders. Mounted at /customer/orders — every route needs a
 * logged-in customer (USER).
 */
export const orderRoutes = Router();
orderRoutes.use(requireAuth, requireRole(Role.USER));

orderRoutes.post('/', validate(createOrderSchema), orderController.create);
orderRoutes.get('/mine', orderController.listMine);
orderRoutes.patch('/:id/cancel', orderController.cancel);

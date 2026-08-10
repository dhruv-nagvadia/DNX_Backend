import { Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate';
import { authController } from './auth.controller';
import { updateMeSchema } from './auth.validation';

/**
 * Shared, token-based auth only. Register/login are role-scoped and live under
 * the audience routers: /customer/auth/* (USER) and /provider/auth/* (PROVIDER).
 */
export const authRoutes = Router();

authRoutes.post('/refresh', authController.refresh);
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.patch('/me', requireAuth, validate(updateMeSchema), authController.updateMe);

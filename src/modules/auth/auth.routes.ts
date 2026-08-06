import { Router } from 'express';
import { requireAuth } from '@/middlewares/auth.middleware';
import { authController } from './auth.controller';

/**
 * Shared, token-based auth only. Register/login are role-scoped and live under
 * the audience routers: /customer/auth/* (USER) and /provider/auth/* (PROVIDER).
 */
export const authRoutes = Router();

authRoutes.post('/refresh', authController.refresh);
authRoutes.get('/me', requireAuth, authController.me);

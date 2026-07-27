import { Router } from 'express';
import { validate } from '@/middlewares/validate';
import { requireAuth } from '@/middlewares/auth.middleware';
import { authController } from './auth.controller';
import { loginSchema, refreshSchema, registerSchema } from './auth.validation';

export const authRoutes = Router();

authRoutes.post('/register', validate(registerSchema), authController.register);
authRoutes.post('/login', validate(loginSchema), authController.login);
authRoutes.post('/refresh', validate(refreshSchema), authController.refresh);
authRoutes.get('/me', requireAuth, authController.me);

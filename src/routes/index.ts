import { Router } from 'express';
import { authRoutes } from '@/modules/auth/auth.routes';
import { categoryRoutes } from '@/modules/category/category.routes';
import { providerRoutes } from '@/modules/provider/provider.routes';
import { bookingRoutes } from '@/modules/booking/booking.routes';

/**
 * Root API router. Every feature module mounts its own sub-router here.
 * Add new modules with a single line — keeps app.ts clean.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/categories', categoryRoutes);
apiRouter.use('/providers', providerRoutes);
apiRouter.use('/bookings', bookingRoutes);

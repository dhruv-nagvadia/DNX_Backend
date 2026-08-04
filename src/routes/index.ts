import { Router } from 'express';
import { authRoutes } from '@/modules/auth/auth.routes';
import { categoryRoutes } from '@/modules/category/category.routes';
import { providerRoutes } from '@/modules/provider/provider.routes';
import { customerRoutes } from '@/modules/customer/customer.routes';

/**
 * Root API router, organized by audience:
 *   /auth, /categories → shared (both apps)
 *   /provider          → provider web dashboard (PROVIDER role)
 *   /customer          → customer mobile app (browse + bookings)
 */
export const apiRouter = Router();

// Shared
apiRouter.use('/auth', authRoutes);
apiRouter.use('/categories', categoryRoutes);

// Audience-specific
apiRouter.use('/provider', providerRoutes);
apiRouter.use('/customer', customerRoutes);

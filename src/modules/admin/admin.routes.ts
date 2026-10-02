import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { authLimiter } from '@/middlewares/rateLimit';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { authController } from '@/modules/auth/auth.controller';
import { loginSchema } from '@/modules/auth/auth.validation';
import { adminAnalyticsController } from './admin.analytics.controller';
import { platformCouponController } from '@/modules/platformCoupon/platformCoupon.controller';
import {
  createPlatformCouponSchema,
  updatePlatformCouponSchema,
} from '@/modules/platformCoupon/platformCoupon.validation';

/**
 * Admin-facing API (used by the unlisted /admin console inside the provider
 * web app). Login only — there's no self-registration for ADMIN accounts;
 * the first one is created via `npm run create-admin`.
 */
export const adminRoutes = Router();

adminRoutes.post('/auth/login', authLimiter, validate(loginSchema), authController.loginAdmin);

// Everything below here requires a signed-in ADMIN.
adminRoutes.use(requireAuth, requireRole(Role.ADMIN));

adminRoutes.get('/analytics/overview', adminAnalyticsController.overview);

// Platform-wide coupons — usable across any business, unlike a provider's own.
adminRoutes.get('/coupons', platformCouponController.list);
adminRoutes.post('/coupons', validate(createPlatformCouponSchema), platformCouponController.create);
adminRoutes.patch(
  '/coupons/:couponId',
  validate(updatePlatformCouponSchema),
  platformCouponController.update,
);
adminRoutes.delete('/coupons/:couponId', platformCouponController.remove);

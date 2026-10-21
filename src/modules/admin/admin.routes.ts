import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { authLimiter } from '@/middlewares/rateLimit';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { authController } from '@/modules/auth/auth.controller';
import { loginSchema } from '@/modules/auth/auth.validation';
import { adminAnalyticsController } from './admin.analytics.controller';
import { growthQuerySchema } from './admin.analytics.validation';
import { adminUsersController } from './admin.users.controller';
import {
  blockUserSchema,
  createPenaltySchema,
  updatePenaltyStatusSchema,
} from './admin.users.validation';
import { adminProvidersController } from './admin.providers.controller';
import { blockReasonSchema, disableCodSchema } from './admin.providers.validation';
import { adminConfigController } from './admin.config.controller';
import { updatePlatformConfigSchema } from './admin.config.validation';
import { adminFinanceController } from './admin.finance.controller';
import {
  breakdownQuerySchema,
  financeRangeSchema,
  servicesQuerySchema,
  transactionsQuerySchema,
  recordPayoutSchema,
  setBusinessCommissionSchema,
} from './admin.finance.validation';
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
adminRoutes.get('/analytics/growth', validate(growthQuerySchema), adminAnalyticsController.growth);

// Customers — no-show history, manual penalty charges, account blocking.
adminRoutes.get('/users', adminUsersController.list);
adminRoutes.get('/users/:userId', adminUsersController.detail);
adminRoutes.post('/users/:userId/block', validate(blockUserSchema), adminUsersController.block);
adminRoutes.post('/users/:userId/unblock', adminUsersController.unblock);
adminRoutes.post(
  '/users/:userId/penalties',
  validate(createPenaltySchema),
  adminUsersController.createPenalty,
);
adminRoutes.patch(
  '/penalties/:penaltyId',
  validate(updatePenaltyStatusSchema),
  adminUsersController.updatePenaltyStatus,
);
adminRoutes.post('/users/:userId/disable-cod', adminUsersController.disableCod);
adminRoutes.post('/users/:userId/enable-cod', adminUsersController.enableCod);

// Providers — block an account or a single business (e.g. late payments,
// complaints), or turn Cash on Delivery off for one business.
adminRoutes.get('/providers', adminProvidersController.list);
adminRoutes.get('/providers/:userId', adminProvidersController.detail);
adminRoutes.post(
  '/providers/:userId/block',
  validate(blockReasonSchema),
  adminProvidersController.blockAccount,
);
adminRoutes.post('/providers/:userId/unblock', adminProvidersController.unblockAccount);
adminRoutes.post(
  '/businesses/:businessId/block',
  validate(blockReasonSchema),
  adminProvidersController.blockBusiness,
);
adminRoutes.post('/businesses/:businessId/unblock', adminProvidersController.unblockBusiness);
adminRoutes.post(
  '/businesses/:businessId/disable-cod',
  validate(disableCodSchema),
  adminProvidersController.disableCod,
);
adminRoutes.post('/businesses/:businessId/enable-cod', adminProvidersController.enableCod);

// Platform-wide settings (e.g. the order pickup window before a no-show can be marked).
adminRoutes.get('/config', adminConfigController.get);
adminRoutes.patch('/config', validate(updatePlatformConfigSchema), adminConfigController.update);

// Money: commission earned, gateway fees, profit, and what's owed to each provider.
adminRoutes.get('/finance/overview', validate(financeRangeSchema), adminFinanceController.overview);
adminRoutes.get(
  '/finance/transactions',
  validate(transactionsQuerySchema),
  adminFinanceController.transactions,
);
adminRoutes.get(
  '/finance/breakdown',
  validate(breakdownQuerySchema),
  adminFinanceController.breakdown,
);
adminRoutes.get(
  '/finance/services',
  validate(servicesQuerySchema),
  adminFinanceController.services,
);
adminRoutes.get('/finance/balances', adminFinanceController.balances);
adminRoutes.get('/finance/businesses', adminFinanceController.businesses);
adminRoutes.patch(
  '/finance/businesses/:businessId/commission',
  validate(setBusinessCommissionSchema),
  adminFinanceController.setBusinessCommission,
);
adminRoutes.get('/finance/payouts', adminFinanceController.listPayouts);
adminRoutes.post(
  '/finance/payouts',
  validate(recordPayoutSchema),
  adminFinanceController.recordPayout,
);
adminRoutes.delete('/finance/payouts/:payoutId', adminFinanceController.deletePayout);

// Platform-wide coupons — usable across any business, unlike a provider's own.
adminRoutes.get('/coupons', platformCouponController.list);
adminRoutes.post('/coupons', validate(createPlatformCouponSchema), platformCouponController.create);
adminRoutes.patch(
  '/coupons/:couponId',
  validate(updatePlatformCouponSchema),
  platformCouponController.update,
);
adminRoutes.delete('/coupons/:couponId', platformCouponController.remove);

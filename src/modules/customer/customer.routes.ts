import { Router } from 'express';
import { Role } from '@prisma/client';
import { validate } from '@/middlewares/validate';
import { requireAuth, requireRole } from '@/middlewares/auth.middleware';
import { authLimiter } from '@/middlewares/rateLimit';
import { customerController } from './customer.controller';
import { couponController } from '@/modules/coupon/coupon.controller';
import { validateCouponSchema } from '@/modules/coupon/coupon.validation';
import { platformCouponController } from '@/modules/platformCoupon/platformCoupon.controller';
import { listProviderSchema } from '@/modules/provider/provider.validation';
import { productController } from '@/modules/product/product.controller';
import { searchProductSchema } from '@/modules/product/product.validation';
import { serviceController } from '@/modules/service/service.controller';
import { searchServiceSchema } from '@/modules/service/service.validation';
import { bookingRoutes } from '@/modules/booking/booking.routes';
import { orderRoutes } from '@/modules/order/order.routes';
import { cartRoutes } from '@/modules/cart/cart.routes';
import { reminderRoutes } from '@/modules/reminder/reminder.routes';
import { paymentRoutes } from '@/modules/payment/payment.routes';
import { addressRoutes } from '@/modules/address/address.routes';
import { reviewController } from '@/modules/review/review.controller';
import { authController } from '@/modules/auth/auth.controller';
import {
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from '@/modules/auth/auth.validation';

/**
 * Customer-facing API (used by the mobile app).
 * Auth here creates/authenticates CUSTOMER (USER) accounts only.
 */
export const customerRoutes = Router();

// Customer auth (public) — rate-limited, since these are the classic
// brute-force / credential-stuffing / OTP-spam targets.
customerRoutes.post(
  '/auth/register',
  authLimiter,
  validate(registerSchema),
  authController.registerCustomer,
);
customerRoutes.post(
  '/auth/login',
  authLimiter,
  validate(loginSchema),
  authController.loginCustomer,
);
customerRoutes.post(
  '/auth/forgot-password',
  authLimiter,
  validate(requestPasswordResetSchema),
  authController.requestPasswordResetCustomer,
);
customerRoutes.post(
  '/auth/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPasswordCustomer,
);

// Public discovery
customerRoutes.get('/providers', validate(listProviderSchema), customerController.listProviders);
customerRoutes.get('/providers/:id/booked-slots', customerController.bookedSlots);
customerRoutes.get('/providers/:id/reviews', reviewController.listPublic);
customerRoutes.get('/providers/:id/coupons', couponController.listPublic);
customerRoutes.get('/providers/:id/platform-coupons', platformCouponController.listApplicableForProvider);
customerRoutes.get('/platform-coupons', platformCouponController.listPublic);
customerRoutes.get('/products', validate(searchProductSchema), productController.searchPublic);
customerRoutes.get('/product-types', productController.listProductTypes);
customerRoutes.get('/services', validate(searchServiceSchema), serviceController.searchPublic);
customerRoutes.get('/products/:id/reviews', reviewController.listProductReviews);
customerRoutes.get('/providers/:id', customerController.getProvider);

// Bookings (auth handled inside the booking router)
customerRoutes.use('/bookings', bookingRoutes);

// Product orders (auth handled inside the order router)
customerRoutes.use('/orders', orderRoutes);

// Preview a coupon against a cart subtotal before ordering
customerRoutes.post(
  '/coupons/validate',
  requireAuth,
  requireRole(Role.USER),
  validate(validateCouponSchema),
  couponController.validateForCustomer,
);

// Persistent cart (auth handled inside the cart router)
customerRoutes.use('/cart', cartRoutes);

// Reminders (auth handled inside the reminder router)
customerRoutes.use('/reminders', reminderRoutes);

// Saved addresses, for on-location service bookings (auth handled inside the router)
customerRoutes.use('/addresses', addressRoutes);

// Payments (auth handled inside the payment router)
customerRoutes.use('/payments', paymentRoutes);

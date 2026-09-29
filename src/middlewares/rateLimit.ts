import rateLimit from 'express-rate-limit';
import { isDev } from '@/config';

// Rate limiting exists to slow down real attackers in production — during
// local development, repeated testing of login/register/reset flows easily
// exceeds these limits within minutes and isn't a security concern, so both
// limiters no-op entirely when running in dev.
const skipInDev = () => isDev;

/** Baseline for every API request — generous enough for normal browsing/polling. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
});

/**
 * Tighter limit for the unauthenticated auth endpoints (login, register,
 * forgot/reset password) — these are the classic brute-force, credential-
 * stuffing and OTP-spam targets, so they get a much lower ceiling than
 * everything else.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' },
  skip: skipInDev,
});

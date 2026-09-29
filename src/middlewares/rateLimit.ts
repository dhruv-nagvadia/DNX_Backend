import rateLimit from 'express-rate-limit';

/** Baseline for every API request — generous enough for normal browsing/polling. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
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
});

import { NextFunction, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { asyncHandler } from '@/utils/asyncHandler';

/**
 * Rejects a request from an account an admin has blocked, even though its
 * access token is still otherwise valid — applied only to the specific
 * routes that create a new booking/order or kick off a payment, not every
 * authenticated request.
 */
export const requireNotBlocked = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(ApiError.unauthorized());
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { isBlocked: true },
  });
  if (user?.isBlocked) return next(ApiError.forbidden('Your account has been blocked. Contact support.'));
  next();
});

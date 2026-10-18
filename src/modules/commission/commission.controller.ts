import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { commissionService } from './commission.service';

/** The signed-in provider's own earnings — sales, platform commission, net, and balance. */
const earnings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { from, to, businessId } = req.query as { from?: string; to?: string; businessId?: string };
  const data = await commissionService.providerEarnings(req.user.sub, { from, to }, businessId);
  sendSuccess(res, data);
});

export const commissionController = { earnings };

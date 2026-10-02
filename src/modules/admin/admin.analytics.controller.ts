import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { adminAnalyticsService } from './admin.analytics.service';

const overview = asyncHandler(async (_req: Request, res: Response) => {
  const data = await adminAnalyticsService.overview();
  sendSuccess(res, data);
});

export const adminAnalyticsController = { overview };

import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { adminAnalyticsService, GrowthGroupBy } from './admin.analytics.service';

const overview = asyncHandler(async (_req: Request, res: Response) => {
  const data = await adminAnalyticsService.overview();
  sendSuccess(res, data);
});

const growth = asyncHandler(async (req: Request, res: Response) => {
  const { groupBy } = req.query as { groupBy?: GrowthGroupBy };
  sendSuccess(res, await adminAnalyticsService.growth(groupBy ?? 'day'));
});

export const adminAnalyticsController = { overview, growth };

import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { platformConfigService } from '@/modules/platformConfig/platformConfig.service';

const get = asyncHandler(async (_req: Request, res: Response) => {
  const config = await platformConfigService.getConfig();
  sendSuccess(res, config);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const config = await platformConfigService.updateConfig(req.body);
  sendSuccess(res, config, 'Settings updated');
});

export const adminConfigController = { get, update };

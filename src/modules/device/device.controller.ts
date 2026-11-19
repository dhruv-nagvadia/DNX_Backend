import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { deviceService } from './device.service';

const register = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const device = await deviceService.register(req.user.sub, req.body);
  sendSuccess(res, device, 'Device registered');
});

const unregister = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await deviceService.unregister(req.user.sub, req.body.token);
  sendSuccess(res, { ok: true });
});

export const deviceController = { register, unregister };

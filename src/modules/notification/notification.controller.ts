import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { notificationService } from './notification.service';

const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const notifications = await notificationService.list(req.user.sub);
  sendSuccess(res, notifications);
});

const unreadCount = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const count = await notificationService.unreadCount(req.user.sub);
  sendSuccess(res, { count });
});

const markRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await notificationService.markRead(req.user.sub, req.params.id);
  sendSuccess(res, { ok: true });
});

const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await notificationService.markAllRead(req.user.sub);
  sendSuccess(res, { ok: true });
});

export const notificationController = { list, unreadCount, markRead, markAllRead };

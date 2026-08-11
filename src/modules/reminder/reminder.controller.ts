import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { reminderService } from './reminder.service';

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const reminder = await reminderService.create(req.user.sub, req.body);
  sendSuccess(res, reminder, 'Reminder added', 201);
});

const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const reminders = await reminderService.listMine(req.user.sub);
  sendSuccess(res, reminders);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const reminder = await reminderService.update(req.user.sub, req.params.id, req.body);
  sendSuccess(res, reminder, 'Reminder updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await reminderService.remove(req.user.sub, req.params.id);
  sendSuccess(res, result, 'Reminder deleted');
});

const markDone = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const reminder = await reminderService.markDone(req.user.sub, req.params.id);
  sendSuccess(res, reminder, 'Reminder updated');
});

export const reminderController = { create, list, update, remove, markDone };

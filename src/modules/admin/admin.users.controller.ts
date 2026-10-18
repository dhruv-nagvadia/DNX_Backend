import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { adminUsersService } from './admin.users.service';

const list = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  const users = await adminUsersService.list(search);
  sendSuccess(res, users);
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminUsersService.detail(req.params.userId);
  sendSuccess(res, data);
});

const block = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.setBlocked(req.params.userId, true, req.body.reason);
  sendSuccess(res, user, 'User blocked');
});

const unblock = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.setBlocked(req.params.userId, false, undefined);
  sendSuccess(res, user, 'User unblocked');
});

const createPenalty = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const penalty = await adminUsersService.createPenalty(req.params.userId, req.user.sub, req.body);
  sendSuccess(res, penalty, 'Charge added', 201);
});

const updatePenaltyStatus = asyncHandler(async (req: Request, res: Response) => {
  const penalty = await adminUsersService.updatePenaltyStatus(req.params.penaltyId, req.body.status);
  sendSuccess(res, penalty, 'Charge updated');
});

const disableCod = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.setCodDisabled(req.params.userId, true);
  sendSuccess(res, user, 'Cash on Delivery disabled for this customer');
});

const enableCod = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.setCodDisabled(req.params.userId, false);
  sendSuccess(res, user, 'Cash on Delivery re-enabled for this customer');
});

export const adminUsersController = {
  list,
  detail,
  block,
  unblock,
  createPenalty,
  updatePenaltyStatus,
  disableCod,
  enableCod,
};

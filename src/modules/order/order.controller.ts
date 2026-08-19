import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { orderService } from './order.service';

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await orderService.create(req.user.sub, req.body);
  sendSuccess(res, result, 'Order placed', 201);
});

const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const orders = await orderService.listMine(req.user.sub);
  sendSuccess(res, orders);
});

export const orderController = { create, listMine };

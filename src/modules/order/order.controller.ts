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

const cancel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.cancelByCustomer(req.user.sub, req.params.id);
  sendSuccess(res, order, 'Order cancelled');
});

// ── Provider order management ────────────────────────────────────────────────
const listForProvider = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const orders = await orderService.listForOwner(req.user.sub);
  sendSuccess(res, orders);
});

const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.updateStatus(
    req.user.sub,
    req.params.orderId,
    req.body.status,
    req.body.reason,
  );
  sendSuccess(res, order, 'Order updated');
});

const collect = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const order = await orderService.collectPayment(req.user.sub, req.params.orderId);
  sendSuccess(res, order, 'Payment collected');
});

export const orderController = { create, listMine, cancel, listForProvider, updateStatus, collect };

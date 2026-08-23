import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { cartService } from './cart.service';

const get = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const items = await cartService.getCart(req.user.sub);
  sendSuccess(res, items);
});

const replace = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const items = await cartService.replaceCart(req.user.sub, req.body.items);
  sendSuccess(res, items, 'Cart saved');
});

export const cartController = { get, replace };

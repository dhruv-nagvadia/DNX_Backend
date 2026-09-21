import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { addressService } from './address.service';

const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const addresses = await addressService.listMine(req.user.sub);
  sendSuccess(res, addresses);
});

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const address = await addressService.create(req.user.sub, req.body);
  sendSuccess(res, address, 'Address added', 201);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const address = await addressService.update(req.user.sub, req.params.id, req.body);
  sendSuccess(res, address, 'Address updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await addressService.remove(req.user.sub, req.params.id);
  sendSuccess(res, result, 'Address deleted');
});

export const addressController = { list, create, update, remove };

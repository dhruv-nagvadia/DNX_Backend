import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { productService } from './product.service';

// `:id` in the route is the providerId (business id).
const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const products = await productService.listForOwner(req.user.sub, req.params.id);
  sendSuccess(res, products);
});

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.create(req.user.sub, req.params.id, req.body);
  sendSuccess(res, product, 'Product added', 201);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.update(
    req.user.sub,
    req.params.id,
    req.params.productId,
    req.body,
  );
  sendSuccess(res, product, 'Product updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await productService.remove(req.user.sub, req.params.id, req.params.productId);
  sendSuccess(res, null, 'Product deleted');
});

export const productController = { list, create, update, remove };

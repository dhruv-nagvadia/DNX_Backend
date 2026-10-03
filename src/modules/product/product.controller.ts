import { ProductType } from '@prisma/client';
import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { productService } from './product.service';
import { SearchProductQuery } from './product.types';

/** DB stores iconUrl as a relative path (e.g. "/assets/product-types/bath-body.png")
 * so it stays portable across environments — made absolute here, the same way
 * category.controller.ts and provider.controller.ts build image URLs. */
function withAbsoluteIcon<T extends Pick<ProductType, 'iconUrl'>>(req: Request, type: T): T {
  if (!type.iconUrl || /^https?:\/\//.test(type.iconUrl)) return type;
  const origin = `${req.protocol}://${req.get('host')}`;
  return { ...type, iconUrl: `${origin}${type.iconUrl}` };
}

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

const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const product = await productService.adjustStock(
    req.user.sub,
    req.params.id,
    req.params.productId,
    req.body,
  );
  sendSuccess(res, product, 'Stock updated');
});

/** Public product search — matches by name, backing the mobile app's "Product" search type. */
const searchPublic = asyncHandler(async (req: Request, res: Response) => {
  const result = await productService.searchPublic(req.query as unknown as SearchProductQuery);
  sendSuccess(res, result);
});

/** Active product types — the "shop by product" browse grid (e.g. "Bath & Body"). */
const listProductTypes = asyncHandler(async (req: Request, res: Response) => {
  const types = await productService.listProductTypes();
  sendSuccess(res, types.map((t) => withAbsoluteIcon(req, t)));
});

export const productController = {
  list,
  create,
  update,
  remove,
  adjustStock,
  searchPublic,
  listProductTypes,
};

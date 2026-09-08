import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { couponService } from './coupon.service';

// ── Provider (business dashboard) ─────────────────────────────────────────────
const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const coupons = await couponService.list(req.user.sub, req.params.id);
  sendSuccess(res, coupons);
});

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const coupon = await couponService.create(req.user.sub, req.params.id, req.body);
  sendSuccess(res, coupon, 'Coupon created', 201);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const coupon = await couponService.update(
    req.user.sub,
    req.params.id,
    req.params.couponId,
    req.body,
  );
  sendSuccess(res, coupon, 'Coupon updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await couponService.remove(req.user.sub, req.params.id, req.params.couponId);
  sendSuccess(res, result, 'Coupon deleted');
});

// ── Customer (checkout) ───────────────────────────────────────────────────────
const validateForCustomer = asyncHandler(async (req: Request, res: Response) => {
  const { providerId, code, subtotalMinor } = req.body;
  const result = await couponService.validateForCustomer(providerId, code, subtotalMinor);
  sendSuccess(res, result, 'Coupon applied');
});

/** Public list of a business's usable coupons (route: /customer/providers/:id/coupons). */
const listPublic = asyncHandler(async (req: Request, res: Response) => {
  const coupons = await couponService.listPublicForProvider(req.params.id);
  sendSuccess(res, coupons);
});

export const couponController = {
  list,
  create,
  update,
  remove,
  validateForCustomer,
  listPublic,
};

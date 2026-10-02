import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { platformCouponService } from './platformCoupon.service';

// ── Admin ──────────────────────────────────────────────────────────────────
const list = asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await platformCouponService.list();
  sendSuccess(res, coupons);
});

const create = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await platformCouponService.create(req.body);
  sendSuccess(res, coupon, 'Coupon created', 201);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  const coupon = await platformCouponService.update(req.params.couponId, req.body);
  sendSuccess(res, coupon, 'Coupon updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  const result = await platformCouponService.remove(req.params.couponId);
  sendSuccess(res, result, 'Coupon deleted');
});

// ── Customer (Home "Offers for you") ───────────────────────────────────────
const listPublic = asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await platformCouponService.listPublic();
  sendSuccess(res, coupons);
});

// ── Customer (checkout — alongside a business's own coupons) ──────────────
const listApplicableForProvider = asyncHandler(async (req: Request, res: Response) => {
  const usage = req.query.usage === 'ORDER' ? 'ORDER' : 'BOOKING';
  const coupons = await platformCouponService.listApplicableForProvider(req.params.id, usage);
  sendSuccess(res, coupons);
});

export const platformCouponController = {
  list,
  create,
  update,
  remove,
  listPublic,
  listApplicableForProvider,
};

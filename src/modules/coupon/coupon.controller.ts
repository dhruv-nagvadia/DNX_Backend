import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { prisma } from '@/lib/prisma';
import { couponService } from './coupon.service';
import { platformCouponService } from '@/modules/platformCoupon/platformCoupon.service';

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
// Falls back to a platform-wide code when it isn't one of this business's own
// — so a customer typing a platform coupon here previews exactly what booking
// or order creation will later apply, instead of a confusing "not valid" error.
const validateForCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { providerId, code, subtotalMinor, serviceId, items } = req.body;
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { categoryId: true },
  });
  const resolved = await platformCouponService.resolveCheckoutCoupon(
    providerId,
    code,
    { subtotalMinor, serviceId, items, categoryId: provider?.categoryId },
    serviceId ? 'BOOKING' : 'ORDER',
  );
  sendSuccess(
    res,
    {
      code: resolved.code,
      description: resolved.description,
      discountType: resolved.discountType,
      discountValue: resolved.discountValue,
      discountMinor: resolved.discountMinor,
      finalMinor: Math.max(0, subtotalMinor - resolved.discountMinor),
    },
    'Coupon applied',
  );
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

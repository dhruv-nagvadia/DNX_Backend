import { Coupon, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { formatINR } from '@/modules/notification/notification.service';
import { providerService } from '@/modules/provider/provider.service';

export interface CouponInput {
  code: string;
  description?: string;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  expiresAt?: string | null;
  usageLimit?: number;
  isActive?: boolean;
}

/** Normalize a code for storage/lookup (case-insensitive, trimmed). */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/**
 * Computes the discount a coupon gives on a subtotal, or an error explaining
 * why it doesn't apply. Never returns more than the subtotal.
 */
export function evaluateCoupon(
  coupon: Coupon,
  subtotalMinor: number,
): { discountMinor: number; error?: string } {
  if (!coupon.isActive) return { discountMinor: 0, error: 'This code is no longer active.' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { discountMinor: 0, error: 'This code has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { discountMinor: 0, error: 'This code has reached its usage limit.' };
  }
  if (subtotalMinor < coupon.minOrderMinor) {
    return {
      discountMinor: 0,
      error: `Add ${formatINR(coupon.minOrderMinor)} of items to use this code.`,
    };
  }

  let discount =
    coupon.discountType === 'PERCENT'
      ? Math.round((subtotalMinor * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.discountType === 'PERCENT' && coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  discount = Math.max(0, Math.min(discount, subtotalMinor));
  return { discountMinor: discount };
}

/** Customer previews a coupon against their cart subtotal. */
async function validateForCustomer(providerId: string, code: string, subtotalMinor: number) {
  const coupon = await prisma.coupon.findUnique({
    where: { providerId_code: { providerId, code: normalizeCode(code) } },
  });
  if (!coupon) throw ApiError.badRequest('That code isn’t valid for this business.');

  const { discountMinor, error } = evaluateCoupon(coupon, subtotalMinor);
  if (error) throw ApiError.badRequest(error);

  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountMinor,
    finalMinor: Math.max(0, subtotalMinor - discountMinor),
  };
}

/** Active, still-usable coupons a customer can see for a business. */
async function listPublicForProvider(providerId: string) {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      providerId,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    orderBy: { minOrderMinor: 'asc' },
  });
  return coupons
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .map((c) => ({
      code: c.code,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderMinor: c.minOrderMinor,
      maxDiscountMinor: c.maxDiscountMinor,
      expiresAt: c.expiresAt,
    }));
}

// ── Provider management ───────────────────────────────────────────────────────

async function list(userId: string, providerId: string) {
  await providerService.getMineById(userId, providerId); // ownership check
  return prisma.coupon.findMany({
    where: { providerId },
    orderBy: { createdAt: 'desc' },
  });
}

function toData(input: Partial<CouponInput>) {
  const data: Prisma.CouponUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = normalizeCode(input.code);
  if (input.description !== undefined) data.description = input.description || null;
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) data.discountValue = input.discountValue;
  if (input.minOrderMinor !== undefined) data.minOrderMinor = input.minOrderMinor;
  if (input.maxDiscountMinor !== undefined) data.maxDiscountMinor = input.maxDiscountMinor;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

async function create(userId: string, providerId: string, input: CouponInput) {
  await providerService.getMineById(userId, providerId); // ownership check
  try {
    return await prisma.coupon.create({
      data: {
        providerId,
        code: normalizeCode(input.code),
        description: input.description || null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minOrderMinor: input.minOrderMinor ?? 0,
        maxDiscountMinor: input.maxDiscountMinor ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        usageLimit: input.usageLimit ?? null,
        isActive: input.isActive ?? true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('You already have a coupon with that code.');
    }
    throw err;
  }
}

async function update(userId: string, providerId: string, couponId: string, input: Partial<CouponInput>) {
  await providerService.getMineById(userId, providerId); // ownership check
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, providerId } });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  try {
    return await prisma.coupon.update({ where: { id: couponId }, data: toData(input) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('You already have a coupon with that code.');
    }
    throw err;
  }
}

async function remove(userId: string, providerId: string, couponId: string) {
  await providerService.getMineById(userId, providerId); // ownership check
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, providerId } });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  await prisma.coupon.delete({ where: { id: couponId } });
  return { id: couponId };
}

export const couponService = {
  validateForCustomer,
  listPublicForProvider,
  evaluateCoupon,
  normalizeCode,
  list,
  create,
  update,
  remove,
};

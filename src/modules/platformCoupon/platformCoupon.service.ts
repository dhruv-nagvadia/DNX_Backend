import { PlatformCoupon, PlatformCouponAppliesTo, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { formatINR } from '@/modules/notification/notification.service';
import { couponService, CouponContext } from '@/modules/coupon/coupon.service';

export interface PlatformCouponInput {
  code: string;
  description?: string;
  appliesTo?: PlatformCouponAppliesTo;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  // Restrict to one business category (e.g. only "Beauty & Wellness"). Omit/null for any category.
  categoryId?: string | null;
  expiresAt?: string | null;
  usageLimit?: number;
  isActive?: boolean;
}

/** What the caller already knows about this checkout, beyond the cart/booking itself. */
export interface CheckoutCouponContext extends CouponContext {
  // The business's own category — checked against a platform coupon's categoryId.
  categoryId?: string;
}

/** A coupon resolved for checkout — either a provider's own, or a platform-wide one. */
export interface ResolvedCheckoutCoupon {
  source: 'PROVIDER' | 'PLATFORM';
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  discountMinor: number;
}

/** Same eligibility rules as a provider Coupon, minus scope (platform codes aren't tied to a service/product). */
function evaluatePlatformCoupon(
  coupon: PlatformCoupon & { category?: { name: string } | null },
  ctx: CheckoutCouponContext,
  usage: 'BOOKING' | 'ORDER',
): { discountMinor: number; error?: string } {
  if (!coupon.isActive) return { discountMinor: 0, error: 'This code is no longer active.' };
  if (coupon.appliesTo !== 'ANY' && coupon.appliesTo !== usage) {
    return {
      discountMinor: 0,
      error:
        usage === 'BOOKING'
          ? 'This code only applies to store orders.'
          : 'This code only applies to bookings.',
    };
  }
  if (coupon.categoryId && coupon.categoryId !== ctx.categoryId) {
    return {
      discountMinor: 0,
      error: `This code only applies to ${coupon.category?.name ?? 'a specific category'} businesses.`,
    };
  }
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { discountMinor: 0, error: 'This code has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { discountMinor: 0, error: 'This code has reached its usage limit.' };
  }
  if (ctx.subtotalMinor < coupon.minOrderMinor) {
    return {
      discountMinor: 0,
      error: `Add ${formatINR(coupon.minOrderMinor)} of items to use this code.`,
    };
  }
  let discount =
    coupon.discountType === 'PERCENT'
      ? Math.round((ctx.subtotalMinor * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.discountType === 'PERCENT' && coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  discount = Math.max(0, Math.min(discount, ctx.subtotalMinor));
  return { discountMinor: discount };
}

/**
 * Looks up a checkout code against the business's own coupons first, then
 * falls back to platform-wide codes. Throws ApiError if the code is invalid
 * or doesn't apply here — callers don't need to handle a "not found" case.
 */
async function resolveCheckoutCoupon(
  providerId: string,
  code: string,
  ctx: CheckoutCouponContext,
  usage: 'BOOKING' | 'ORDER',
): Promise<ResolvedCheckoutCoupon> {
  const normalized = couponService.normalizeCode(code);

  const providerCoupon = await prisma.coupon.findUnique({
    where: { providerId_code: { providerId, code: normalized } },
  });
  if (providerCoupon) {
    const evaluated = couponService.evaluateCoupon(providerCoupon, ctx);
    if (evaluated.error) throw ApiError.badRequest(evaluated.error);
    return {
      source: 'PROVIDER',
      id: providerCoupon.id,
      code: providerCoupon.code,
      description: providerCoupon.description,
      discountType: providerCoupon.discountType,
      discountValue: providerCoupon.discountValue,
      discountMinor: evaluated.discountMinor,
    };
  }

  const platformCoupon = await prisma.platformCoupon.findUnique({
    where: { code: normalized },
    include: { category: { select: { name: true } } },
  });
  if (!platformCoupon) {
    throw ApiError.badRequest(
      usage === 'BOOKING' ? 'That code isn’t valid for this business.' : 'That code isn’t valid for this store.',
    );
  }
  const evaluated = evaluatePlatformCoupon(platformCoupon, ctx, usage);
  if (evaluated.error) throw ApiError.badRequest(evaluated.error);
  return {
    source: 'PLATFORM',
    id: platformCoupon.id,
    code: platformCoupon.code,
    description: platformCoupon.description,
    discountType: platformCoupon.discountType,
    discountValue: platformCoupon.discountValue,
    discountMinor: evaluated.discountMinor,
  };
}

/** Redeems a resolved coupon inside the caller's transaction. */
async function redeem(tx: Prisma.TransactionClient, resolved: ResolvedCheckoutCoupon) {
  if (resolved.source === 'PROVIDER') {
    await tx.coupon.update({ where: { id: resolved.id }, data: { usedCount: { increment: 1 } } });
  } else {
    await tx.platformCoupon.update({
      where: { id: resolved.id },
      data: { usedCount: { increment: 1 } },
    });
  }
}

/** Active, still-usable platform coupons — shown to customers (e.g. Home "Offers for you"). */
async function listPublic() {
  const now = new Date();
  const coupons = await prisma.platformCoupon.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    },
    include: { category: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return coupons
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .map((c) => ({
      code: c.code,
      description: c.description,
      appliesTo: c.appliesTo,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderMinor: c.minOrderMinor,
      maxDiscountMinor: c.maxDiscountMinor,
      categoryName: c.category?.name ?? null,
      categorySlug: c.category?.slug ?? null,
      expiresAt: c.expiresAt,
    }));
}

/**
 * Active, still-usable platform coupons that could actually apply to a
 * specific business's checkout — filtered by appliesTo (vs. this usage) and
 * category (vs. this provider's own category). Shown alongside a business's
 * own coupons in the "Available offers" list during booking/order checkout.
 */
async function listApplicableForProvider(providerId: string, usage: 'BOOKING' | 'ORDER') {
  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { categoryId: true },
  });
  const now = new Date();
  const coupons = await prisma.platformCoupon.findMany({
    where: {
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      AND: [
        { OR: [{ appliesTo: 'ANY' }, { appliesTo: usage }] },
        { OR: [{ categoryId: null }, { categoryId: provider?.categoryId }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
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

// ── Admin management ──────────────────────────────────────────────────────────

function list() {
  return prisma.platformCoupon.findMany({
    include: { category: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

function toData(input: Partial<PlatformCouponInput>) {
  const data: Prisma.PlatformCouponUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = couponService.normalizeCode(input.code);
  if (input.description !== undefined) data.description = input.description || null;
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) data.discountValue = input.discountValue;
  if (input.minOrderMinor !== undefined) data.minOrderMinor = input.minOrderMinor;
  if (input.maxDiscountMinor !== undefined) data.maxDiscountMinor = input.maxDiscountMinor;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId || null;
  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  }
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

async function create(input: PlatformCouponInput) {
  try {
    return await prisma.platformCoupon.create({
      data: {
        code: couponService.normalizeCode(input.code),
        description: input.description || null,
        appliesTo: input.appliesTo ?? 'ANY',
        discountType: input.discountType,
        discountValue: input.discountValue,
        minOrderMinor: input.minOrderMinor ?? 0,
        maxDiscountMinor: input.maxDiscountMinor ?? null,
        categoryId: input.categoryId || null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        usageLimit: input.usageLimit ?? null,
        isActive: input.isActive ?? true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('A platform coupon with that code already exists.');
    }
    throw err;
  }
}

async function update(couponId: string, input: Partial<PlatformCouponInput>) {
  const coupon = await prisma.platformCoupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  try {
    return await prisma.platformCoupon.update({ where: { id: couponId }, data: toData(input) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('A platform coupon with that code already exists.');
    }
    throw err;
  }
}

async function remove(couponId: string) {
  const coupon = await prisma.platformCoupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  await prisma.platformCoupon.delete({ where: { id: couponId } });
  return { id: couponId };
}

export const platformCouponService = {
  resolveCheckoutCoupon,
  redeem,
  listPublic,
  listApplicableForProvider,
  list,
  create,
  update,
  remove,
};

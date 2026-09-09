import { Coupon, CouponScope, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { formatINR } from '@/modules/notification/notification.service';
import { providerService } from '@/modules/provider/provider.service';

export interface CouponInput {
  code: string;
  description?: string;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  scope?: CouponScope;
  serviceId?: string | null;
  productId?: string | null;
  minOrderMinor?: number;
  maxDiscountMinor?: number;
  expiresAt?: string | null;
  usageLimit?: number;
  isActive?: boolean;
}

/** What's being purchased, for scope-aware eligibility + discount math. */
export interface CouponContext {
  // Whole-order/booking subtotal (used for ORDER scope, and as the amount a
  // SERVICE-scoped discount is computed against — a booking is one service).
  subtotalMinor: number;
  // The service being booked (bookings only).
  serviceId?: string;
  // Order line items, so a PRODUCT-scoped coupon discounts just that line.
  items?: { productId: string; lineTotalMinor: number }[];
}

/** Normalize a code for storage/lookup (case-insensitive, trimmed). */
export const normalizeCode = (code: string) => code.trim().toUpperCase();

/** Percent/flat discount off one amount, capped by maxDiscountMinor and the amount itself. */
function computeDiscount(coupon: Coupon, amountMinor: number): number {
  let discount =
    coupon.discountType === 'PERCENT'
      ? Math.round((amountMinor * coupon.discountValue) / 100)
      : coupon.discountValue;
  if (coupon.discountType === 'PERCENT' && coupon.maxDiscountMinor != null) {
    discount = Math.min(discount, coupon.maxDiscountMinor);
  }
  return Math.max(0, Math.min(discount, amountMinor));
}

/**
 * Computes the discount a coupon gives in this context, or an error explaining
 * why it doesn't apply. Never returns more than the relevant amount.
 */
export function evaluateCoupon(
  coupon: Coupon,
  ctx: CouponContext,
): { discountMinor: number; error?: string } {
  if (!coupon.isActive) return { discountMinor: 0, error: 'This code is no longer active.' };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
    return { discountMinor: 0, error: 'This code has expired.' };
  }
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    return { discountMinor: 0, error: 'This code has reached its usage limit.' };
  }

  if (coupon.scope === 'SERVICE') {
    if (!ctx.serviceId || ctx.serviceId !== coupon.serviceId) {
      return { discountMinor: 0, error: 'This code only applies to a specific service.' };
    }
    return { discountMinor: computeDiscount(coupon, ctx.subtotalMinor) };
  }

  if (coupon.scope === 'PRODUCT') {
    const item = ctx.items?.find((i) => i.productId === coupon.productId);
    if (!item) {
      return { discountMinor: 0, error: 'This code only applies to a specific product.' };
    }
    return { discountMinor: computeDiscount(coupon, item.lineTotalMinor) };
  }

  // ORDER scope (default): eligibility is the whole subtotal vs. a minimum.
  if (ctx.subtotalMinor < coupon.minOrderMinor) {
    return {
      discountMinor: 0,
      error: `Add ${formatINR(coupon.minOrderMinor)} of items to use this code.`,
    };
  }
  return { discountMinor: computeDiscount(coupon, ctx.subtotalMinor) };
}

/** Customer previews a coupon against their cart/booking. */
async function validateForCustomer(
  providerId: string,
  code: string,
  ctx: CouponContext,
) {
  const coupon = await prisma.coupon.findUnique({
    where: { providerId_code: { providerId, code: normalizeCode(code) } },
  });
  if (!coupon) throw ApiError.badRequest('That code isn’t valid for this business.');

  const { discountMinor, error } = evaluateCoupon(coupon, ctx);
  if (error) throw ApiError.badRequest(error);

  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountMinor,
    finalMinor: Math.max(0, ctx.subtotalMinor - discountMinor),
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
    include: {
      service: { select: { name: true } },
      product: { select: { name: true } },
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
      scope: c.scope,
      serviceId: c.serviceId,
      serviceName: c.service?.name ?? null,
      productId: c.productId,
      productName: c.product?.name ?? null,
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
    include: {
      service: { select: { name: true } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Validates that a SERVICE/PRODUCT scope points at something real, owned by this business. */
async function assertScopeTarget(
  providerId: string,
  businessType: 'SERVICE' | 'STORE',
  input: Pick<CouponInput, 'scope' | 'serviceId' | 'productId'>,
) {
  const scope = input.scope ?? 'ORDER';
  if (scope === 'SERVICE') {
    if (businessType !== 'SERVICE') {
      throw ApiError.badRequest('Only service businesses can scope a coupon to a service.');
    }
    if (!input.serviceId) throw ApiError.badRequest('Pick a service for this coupon.');
    const service = await prisma.service.findFirst({
      where: { id: input.serviceId, providerId },
    });
    if (!service) throw ApiError.badRequest('That service doesn’t belong to this business.');
  } else if (scope === 'PRODUCT') {
    if (businessType !== 'STORE') {
      throw ApiError.badRequest('Only stores can scope a coupon to a product.');
    }
    if (!input.productId) throw ApiError.badRequest('Pick a product for this coupon.');
    const product = await prisma.product.findFirst({
      where: { id: input.productId, providerId },
    });
    if (!product) throw ApiError.badRequest('That product doesn’t belong to this business.');
  }
}

function toData(input: Partial<CouponInput>) {
  const data: Prisma.CouponUncheckedUpdateInput = {};
  if (input.code !== undefined) data.code = normalizeCode(input.code);
  if (input.description !== undefined) data.description = input.description || null;
  if (input.discountType !== undefined) data.discountType = input.discountType;
  if (input.discountValue !== undefined) data.discountValue = input.discountValue;
  if (input.scope !== undefined) {
    data.scope = input.scope;
    // Scope is mutually exclusive — clear the id that no longer applies.
    data.serviceId = input.scope === 'SERVICE' ? input.serviceId ?? null : null;
    data.productId = input.scope === 'PRODUCT' ? input.productId ?? null : null;
    data.minOrderMinor = input.scope === 'ORDER' ? input.minOrderMinor ?? 0 : 0;
  } else if (input.minOrderMinor !== undefined) {
    data.minOrderMinor = input.minOrderMinor;
  }
  if (input.maxDiscountMinor !== undefined) data.maxDiscountMinor = input.maxDiscountMinor;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.usageLimit !== undefined) data.usageLimit = input.usageLimit;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

async function create(userId: string, providerId: string, input: CouponInput) {
  const provider = await providerService.getMineById(userId, providerId); // ownership check
  await assertScopeTarget(providerId, provider.type, input);

  const scope = input.scope ?? 'ORDER';
  try {
    return await prisma.coupon.create({
      data: {
        providerId,
        code: normalizeCode(input.code),
        description: input.description || null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        scope,
        serviceId: scope === 'SERVICE' ? input.serviceId ?? null : null,
        productId: scope === 'PRODUCT' ? input.productId ?? null : null,
        minOrderMinor: scope === 'ORDER' ? input.minOrderMinor ?? 0 : 0,
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
  const provider = await providerService.getMineById(userId, providerId); // ownership check
  const coupon = await prisma.coupon.findFirst({ where: { id: couponId, providerId } });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  if (input.scope !== undefined) {
    await assertScopeTarget(providerId, provider.type, {
      scope: input.scope,
      serviceId: input.serviceId,
      productId: input.productId,
    });
  }
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

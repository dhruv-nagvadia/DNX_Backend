import { z } from 'zod';

const base = {
  code: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _ only'),
  description: z.string().max(200).optional(),
  discountType: z.enum(['PERCENT', 'FLAT']),
  discountValue: z.coerce.number().int().positive(),
  scope: z.enum(['ORDER', 'SERVICE', 'PRODUCT']).optional(),
  serviceId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  minOrderMinor: z.coerce.number().int().min(0).optional(),
  maxDiscountMinor: z.coerce.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  usageLimit: z.coerce.number().int().positive().optional(),
  isActive: z.boolean().optional(),
};

// A percentage discount can't exceed 100%.
const percentGuard = (data: { discountType: string; discountValue?: number }) =>
  data.discountType !== 'PERCENT' || (data.discountValue ?? 0) <= 100;

// A SERVICE/PRODUCT scope must name which one; ORDER doesn't need either.
const scopeGuard = (data: { scope?: string; serviceId?: string; productId?: string }) => {
  if (data.scope === 'SERVICE') return !!data.serviceId;
  if (data.scope === 'PRODUCT') return !!data.productId;
  return true;
};

export const createCouponSchema = z.object({
  body: z
    .object(base)
    .refine(percentGuard, {
      message: 'A percentage discount must be 100 or less',
      path: ['discountValue'],
    })
    .refine(scopeGuard, {
      message: 'Pick the service or product this coupon applies to',
      path: ['scope'],
    }),
});

export const updateCouponSchema = z.object({
  body: z
    .object({
      code: base.code.optional(),
      description: base.description,
      discountType: base.discountType.optional(),
      discountValue: base.discountValue.optional(),
      scope: base.scope,
      serviceId: base.serviceId,
      productId: base.productId,
      minOrderMinor: base.minOrderMinor,
      maxDiscountMinor: base.maxDiscountMinor,
      expiresAt: base.expiresAt.nullable().optional(),
      usageLimit: base.usageLimit,
      isActive: base.isActive,
    })
    .refine((d) => d.discountType !== 'PERCENT' || (d.discountValue ?? 0) <= 100, {
      message: 'A percentage discount must be 100 or less',
      path: ['discountValue'],
    })
    .refine(scopeGuard, {
      message: 'Pick the service or product this coupon applies to',
      path: ['scope'],
    }),
});

// Customer checks a code before ordering/booking. Send serviceId when booking
// (a SERVICE-scoped coupon needs it), or items when ordering (a PRODUCT-scoped
// coupon discounts just that line).
export const validateCouponSchema = z.object({
  body: z.object({
    providerId: z.string().min(1),
    code: z.string().trim().min(1),
    subtotalMinor: z.coerce.number().int().min(0),
    serviceId: z.string().min(1).optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          lineTotalMinor: z.coerce.number().int().min(0),
        }),
      )
      .optional(),
  }),
});

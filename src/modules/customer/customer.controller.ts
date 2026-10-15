import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { providerService } from '@/modules/provider/provider.service';
import { ListProviderQuery } from '@/modules/provider/provider.types';
import { bookingService } from '@/modules/booking/booking.service';
import { platformCouponService } from '@/modules/platformCoupon/platformCoupon.service';

/** DB stores iconUrl as a relative path (e.g. "/assets/product-types/bath-body.png")
 * so it stays portable across environments — made absolute here, the same way
 * category.controller.ts and product.controller.ts build image URLs. */
function withAbsoluteIcon(req: Request, iconUrl: string | null | undefined): string | null | undefined {
  if (!iconUrl || /^https?:\/\//.test(iconUrl)) return iconUrl;
  return `${req.protocol}://${req.get('host')}${iconUrl}`;
}

/**
 * Customer-facing discovery. Reuses the shared provider data layer but only
 * exposes the public, read-only views (active providers + active services).
 */
const listProviders = asyncHandler(async (req: Request, res: Response) => {
  const result = await providerService.list(req.query as unknown as ListProviderQuery);
  sendSuccess(res, result);
});

const getProvider = asyncHandler(async (req: Request, res: Response) => {
  const postalCode = typeof req.query.postalCode === 'string' ? req.query.postalCode : undefined;
  const provider = await providerService.getById(req.params.id, postalCode);
  const couponByProductId = await platformCouponService.bestCouponForProducts(
    provider.id,
    provider.categoryId,
    provider.products.map((p) => ({ id: p.id, priceMinor: p.priceMinor })),
  );
  const products = provider.products.map((p) => ({
    ...p,
    productType: p.productType
      ? { ...p.productType, iconUrl: withAbsoluteIcon(req, p.productType.iconUrl) }
      : p.productType,
    coupon: couponByProductId.get(p.id) ?? null,
    // The store's own flag AND this product's — a product can only narrow
    // either further, never re-enable it for a store that's opted out.
    codEnabled: p.codEnabled && provider.codEnabled,
    partialPayEnabled: p.partialPayEnabled && provider.partialPayEnabled,
  }));
  sendSuccess(res, { ...provider, products });
});

/** Upcoming booked intervals, so the app can hide unavailable slots. */
const bookedSlots = asyncHandler(async (req: Request, res: Response) => {
  const slots = await bookingService.bookedSlots(req.params.id);
  sendSuccess(res, slots);
});

export const customerController = { listProviders, getProvider, bookedSlots };

import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { providerService } from '@/modules/provider/provider.service';
import { ListProviderQuery } from '@/modules/provider/provider.types';
import { bookingService } from '@/modules/booking/booking.service';

/**
 * Customer-facing discovery. Reuses the shared provider data layer but only
 * exposes the public, read-only views (active providers + active services).
 */
const listProviders = asyncHandler(async (req: Request, res: Response) => {
  const result = await providerService.list(req.query as unknown as ListProviderQuery);
  sendSuccess(res, result);
});

const getProvider = asyncHandler(async (req: Request, res: Response) => {
  const provider = await providerService.getById(req.params.id);
  sendSuccess(res, provider);
});

/** Upcoming booked intervals, so the app can hide unavailable slots. */
const bookedSlots = asyncHandler(async (req: Request, res: Response) => {
  const slots = await bookingService.bookedSlots(req.params.id);
  sendSuccess(res, slots);
});

export const customerController = { listProviders, getProvider, bookedSlots };

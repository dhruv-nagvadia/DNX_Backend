import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { providerService } from '@/modules/provider/provider.service';
import { ListProviderQuery } from '@/modules/provider/provider.types';

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

export const customerController = { listProviders, getProvider };

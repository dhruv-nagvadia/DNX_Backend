import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { providerService } from './provider.service';
import { ListProviderQuery } from './provider.types';

const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await providerService.list(req.query as unknown as ListProviderQuery);
  sendSuccess(res, result);
});

const getById = asyncHandler(async (req: Request, res: Response) => {
  const provider = await providerService.getById(req.params.id);
  sendSuccess(res, provider);
});

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.create(req.user.sub, req.body);
  sendSuccess(res, provider, 'Provider profile created', 201);
});

const getMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.getMine(req.user.sub);
  sendSuccess(res, provider);
});

const uploadImages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0) throw ApiError.badRequest('No images uploaded');

  // Build absolute URLs so web/mobile clients can load them directly.
  const origin = `${req.protocol}://${req.get('host')}`;
  const urls = files.map((f) => `${origin}/uploads/${f.filename}`);

  const provider = await providerService.addImages(req.user.sub, urls);
  sendSuccess(res, provider, 'Images uploaded');
});

export const providerController = { list, getById, create, getMine, uploadImages };

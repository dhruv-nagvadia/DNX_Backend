import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { providerService } from './provider.service';

// Public browse (list/getById) lives in the customer module. This controller
// only handles a provider managing their OWN businesses.
const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.create(req.user.sub, req.body);
  sendSuccess(res, provider, 'Business created', 201);
});

const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const businesses = await providerService.listMine(req.user.sub);
  sendSuccess(res, businesses);
});

const getMineOne = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.getMineById(req.user.sub, req.params.id);
  sendSuccess(res, provider);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.update(req.user.sub, req.params.id, req.body);
  sendSuccess(res, provider, 'Business updated');
});

const setHours = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.setHours(req.user.sub, req.params.id, req.body.hours);
  sendSuccess(res, provider, 'Business hours updated');
});

const uploadImages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length === 0) throw ApiError.badRequest('No images uploaded');

  const origin = `${req.protocol}://${req.get('host')}`;
  const urls = files.map((f) => `${origin}/uploads/${f.filename}`);

  const provider = await providerService.addImages(req.user.sub, req.params.id, urls);
  sendSuccess(res, provider, 'Images uploaded');
});

export const providerController = {
  create,
  listMine,
  getMineOne,
  update,
  setHours,
  uploadImages,
};

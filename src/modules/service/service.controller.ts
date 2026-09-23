import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { serviceService } from './service.service';
import { SearchServiceQuery } from './service.types';

// `:id` in the route is the providerId (business id).
const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const service = await serviceService.create(req.user.sub, req.params.id, req.body);
  sendSuccess(res, service, 'Service added', 201);
});

const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const service = await serviceService.update(
    req.user.sub,
    req.params.id,
    req.params.serviceId,
    req.body,
  );
  sendSuccess(res, service, 'Service updated');
});

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await serviceService.remove(req.user.sub, req.params.id, req.params.serviceId);
  sendSuccess(res, null, 'Service deleted');
});

/** Public service search — matches by service name, backing the mobile app's "Service" search type. */
const searchPublic = asyncHandler(async (req: Request, res: Response) => {
  const result = await serviceService.searchPublic(req.query as unknown as SearchServiceQuery);
  sendSuccess(res, result);
});

export const serviceController = { create, update, remove, searchPublic };

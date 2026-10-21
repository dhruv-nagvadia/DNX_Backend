import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { adminProvidersService } from './admin.providers.service';

const list = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  sendSuccess(res, await adminProvidersService.list(search));
});

const detail = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await adminProvidersService.detail(req.params.userId));
});

const blockAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setAccountBlocked(
    req.params.userId,
    true,
    req.body.reason,
  );
  sendSuccess(res, data, 'Provider account blocked');
});

const unblockAccount = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setAccountBlocked(req.params.userId, false);
  sendSuccess(res, data, 'Provider account unblocked');
});

const blockBusiness = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setBusinessBlocked(
    req.params.businessId,
    true,
    req.body.reason,
  );
  sendSuccess(res, data, 'Business blocked');
});

const unblockBusiness = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setBusinessBlocked(req.params.businessId, false);
  sendSuccess(res, data, 'Business unblocked');
});

const disableCod = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setBusinessCod(
    req.params.businessId,
    true,
    req.body.reason,
  );
  sendSuccess(res, data, 'Cash on Delivery turned off');
});

const enableCod = asyncHandler(async (req: Request, res: Response) => {
  const data = await adminProvidersService.setBusinessCod(req.params.businessId, false);
  sendSuccess(res, data, 'Cash on Delivery turned back on');
});

export const adminProvidersController = {
  list,
  detail,
  blockAccount,
  unblockAccount,
  blockBusiness,
  unblockBusiness,
  disableCod,
  enableCod,
};

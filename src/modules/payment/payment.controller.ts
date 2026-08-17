import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { paymentService } from './payment.service';

const createLink = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.createPaymentLink(req.user.sub, req.body.bookingId);
  sendSuccess(res, result);
});

const simulate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.simulatePayment(req.user.sub, req.body.bookingId);
  sendSuccess(res, result, 'Payment successful');
});

const sync = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.syncPayment(req.user.sub, req.body.bookingId);
  sendSuccess(res, result);
});

const webhook = asyncHandler(async (req: Request, res: Response) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const signature = req.headers['x-razorpay-signature'] as string | undefined;
  const result = await paymentService.handleWebhook(raw, signature);
  res.json(result);
});

export const paymentController = { createLink, simulate, sync, webhook };

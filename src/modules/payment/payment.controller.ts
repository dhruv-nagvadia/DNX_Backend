import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { paymentService } from './payment.service';

const createLink = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.createPaymentOrder(req.user.sub, req.body.bookingId);
  sendSuccess(res, result);
});

const simulate = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.simulatePayment(req.user.sub, req.body.bookingId);
  sendSuccess(res, result, 'Payment successful');
});

const verify = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const result = await paymentService.verifyPayment(
    req.user.sub,
    bookingId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );
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

// ── Store orders ─────────────────────────────────────────────────────────────

const createOrderLink = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.createOrderPaymentOrder(req.user.sub, req.body.orderId);
  sendSuccess(res, result);
});

const simulateOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.simulateOrderPayment(req.user.sub, req.body.orderId);
  sendSuccess(res, result, 'Payment successful');
});

const verifyOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const result = await paymentService.verifyOrderPayment(
    req.user.sub,
    orderId,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );
  sendSuccess(res, result, 'Payment successful');
});

const syncOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.syncOrderPayment(req.user.sub, req.body.orderId);
  sendSuccess(res, result);
});

// Pay-then-place cart checkout: no order exists until the payment is confirmed.
const startCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await paymentService.startOrderCheckout(req.user.sub, req.body);
  sendSuccess(res, result);
});

const confirmCheckout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const result = await paymentService.confirmOrderCheckout(
    req.user.sub,
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );
  sendSuccess(res, result, 'Payment successful');
});

export const paymentController = {
  createLink,
  simulate,
  verify,
  sync,
  webhook,
  createOrderLink,
  simulateOrder,
  verifyOrder,
  syncOrder,
  startCheckout,
  confirmCheckout,
};

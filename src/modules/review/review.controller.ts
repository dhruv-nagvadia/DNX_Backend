import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { reviewService } from './review.service';
import { providerService } from '@/modules/provider/provider.service';

/** Customer creates a review for their completed booking (route: /customer/bookings/:id/review). */
const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.create(req.user.sub, req.params.id, req.body);
  sendSuccess(res, review, 'Thanks for your review', 201);
});

/** Customer creates a review for their completed order (route: /customer/orders/:id/review). */
const createForOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.createForOrder(req.user.sub, req.params.id, req.body);
  sendSuccess(res, review, 'Thanks for your review', 201);
});

/** Customer reviews one product in a completed order
 *  (route: /customer/orders/:id/products/:productId/review). */
const createForProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.createForProduct(
    req.user.sub,
    req.params.id,
    req.params.productId,
    req.body,
  );
  sendSuccess(res, review, 'Thanks for your review', 201);
});

/** Public list of a provider's reviews (route: /customer/providers/:id/reviews). */
const listPublic = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.listForProvider(req.params.id);
  sendSuccess(res, reviews);
});

/** Public list of a product's reviews (route: /customer/products/:id/reviews). */
const listProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.listForProduct(req.params.id);
  sendSuccess(res, reviews);
});

/** Owner list of a business's reviews (route: /provider/businesses/:id/reviews). */
const listForOwner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await providerService.getMineById(req.user.sub, req.params.id); // ownership check
  const reviews = await reviewService.listForProvider(req.params.id);
  sendSuccess(res, reviews);
});

/** Owner replies to a business review
 *  (route: /provider/businesses/:id/reviews/:reviewId/reply). */
const reply = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.reply(
    req.user.sub,
    req.params.id,
    req.params.reviewId,
    req.body.reply?.trim() || null,
  );
  sendSuccess(res, review, 'Reply saved');
});

/** Owner replies to a product review
 *  (route: /provider/businesses/:id/products/:productId/reviews/:reviewId/reply). */
const replyToProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const review = await reviewService.replyToProduct(
    req.user.sub,
    req.params.id,
    req.params.productId,
    req.params.reviewId,
    req.body.reply?.trim() || null,
  );
  sendSuccess(res, review, 'Reply saved');
});

export const reviewController = {
  create,
  createForOrder,
  createForProduct,
  listPublic,
  listProductReviews,
  listForOwner,
  reply,
  replyToProduct,
};

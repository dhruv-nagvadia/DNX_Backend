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

/** Public list of a provider's reviews (route: /customer/providers/:id/reviews). */
const listPublic = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await reviewService.listForProvider(req.params.id);
  sendSuccess(res, reviews);
});

/** Owner list of a business's reviews (route: /provider/businesses/:id/reviews). */
const listForOwner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await providerService.getMineById(req.user.sub, req.params.id); // ownership check
  const reviews = await reviewService.listForProvider(req.params.id);
  sendSuccess(res, reviews);
});

export const reviewController = { create, listPublic, listForOwner };

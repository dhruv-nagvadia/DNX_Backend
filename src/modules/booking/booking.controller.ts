import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { bookingService } from './booking.service';

const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const booking = await bookingService.create(req.user.sub, req.body);
  sendSuccess(res, booking, 'Booking confirmed', 201);
});

const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const bookings = await bookingService.listMine(req.user.sub);
  sendSuccess(res, bookings);
});

const cancel = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const booking = await bookingService.cancelByCustomer(req.user.sub, req.params.id);
  sendSuccess(res, booking, 'Booking cancelled');
});

const reschedule = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const booking = await bookingService.rescheduleByCustomer(
    req.user.sub,
    req.params.id,
    req.body.startTime,
  );
  sendSuccess(res, booking, 'Booking rescheduled');
});

export const bookingController = { create, listMine, cancel, reschedule };

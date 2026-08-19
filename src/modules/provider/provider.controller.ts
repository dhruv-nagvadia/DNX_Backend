import { Request, Response } from 'express';
import { asyncHandler } from '@/utils/asyncHandler';
import { sendSuccess } from '@/utils/ApiResponse';
import { ApiError } from '@/utils/ApiError';
import { providerService } from './provider.service';
import { bookingService } from '@/modules/booking/booking.service';
import { paymentService } from '@/modules/payment/payment.service';

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

const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await providerService.remove(req.user.sub, req.params.id);
  sendSuccess(res, result, 'Business deleted');
});

const setImages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.setImages(req.user.sub, req.params.id, req.body.images);
  sendSuccess(res, provider, 'Photos updated');
});

const setHours = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const provider = await providerService.setHours(req.user.sub, req.params.id, req.body.hours);
  sendSuccess(res, provider, 'Business hours updated');
});

const listBookings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await providerService.getMineById(req.user.sub, req.params.id); // ownership check
  const bookings = await bookingService.listForProvider(req.params.id);
  sendSuccess(res, bookings);
});

// Every booking across all of the provider's businesses (home dashboard).
const listAllBookings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const bookings = await bookingService.listForOwner(req.user.sub);
  sendSuccess(res, bookings);
});

const updateBooking = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await providerService.getMineById(req.user.sub, req.params.id); // ownership check
  const booking = await bookingService.updateStatus(
    req.params.id,
    req.params.bookingId,
    req.body.status,
    req.body.reason,
  );
  sendSuccess(res, booking, 'Booking updated');
});

// Provider marks the outstanding cash balance as collected (cash / partial-remaining).
const collectBookingPayment = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await providerService.getMineById(req.user.sub, req.params.id); // ownership check
  const result = await paymentService.collectPayment(req.params.id, req.params.bookingId);
  sendSuccess(res, result, 'Payment collected');
});

const listDateHours = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { from, to } = req.query as { from?: string; to?: string };
  const data = await providerService.listDateHours(req.user.sub, req.params.id, from, to);
  sendSuccess(res, data);
});

const setDateHour = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await providerService.setDateHour(req.user.sub, req.params.id, req.body);
  sendSuccess(res, data, 'Date hours saved');
});

const deleteDateHour = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = await providerService.deleteDateHour(req.user.sub, req.params.id, req.params.date);
  sendSuccess(res, data, 'Date override removed');
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

// Uploads a single image (e.g. a product photo) and returns its URL.
const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const file = req.file as Express.Multer.File | undefined;
  if (!file) throw ApiError.badRequest('No image uploaded');
  const url = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
  sendSuccess(res, { url }, 'Image uploaded');
});

export const providerController = {
  create,
  listMine,
  getMineOne,
  update,
  remove,
  setImages,
  setHours,
  listBookings,
  listAllBookings,
  updateBooking,
  collectBookingPayment,
  listDateHours,
  setDateHour,
  deleteDateHour,
  uploadImages,
  uploadImage,
};

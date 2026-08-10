import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateBookingInput } from './booking.types';

// What the customer app sees for each booking.
const bookingSelect = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  amountMinor: true,
  currency: true,
  cancelReason: true,
  service: { select: { id: true, name: true, durationMin: true } },
  provider: {
    select: { id: true, businessName: true, category: { select: { slug: true, name: true } } },
  },
  review: { select: { id: true, rating: true } },
} satisfies Prisma.BookingSelect;

// What the provider dashboard sees for each booking.
const providerBookingSelect = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  amountMinor: true,
  currency: true,
  cancelReason: true,
  service: { select: { name: true } },
  user: { select: { fullName: true, phone: true } },
} satisfies Prisma.BookingSelect;

// Allowed provider-driven status transitions (others are terminal).
const PROVIDER_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Books a service slot for the customer. */
async function create(userId: string, input: CreateBookingInput) {
  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || service.providerId !== input.providerId || !service.isActive) {
    throw ApiError.badRequest('That service is not available');
  }

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Invalid start time');
  if (start.getTime() < Date.now()) throw ApiError.badRequest('Pick a time in the future');

  const end = new Date(start.getTime() + service.durationMin * 60_000);

  try {
    return await prisma.booking.create({
      data: {
        userId,
        providerId: input.providerId,
        serviceId: service.id,
        startTime: start,
        endTime: end,
        status: 'PENDING',
        notes: input.notes,
        amountMinor: service.priceMinor,
        currency: service.currency,
      },
      select: bookingSelect,
    });
  } catch (err) {
    // @@unique([providerId, startTime]) → someone grabbed this slot first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('That slot was just taken. Please pick another time.');
    }
    throw err;
  }
}

/** The logged-in customer's bookings (newest first). */
async function listMine(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    orderBy: { startTime: 'desc' },
    select: bookingSelect,
  });
}

/** Upcoming booked intervals for a provider — used to compute availability. */
async function bookedSlots(providerId: string) {
  return prisma.booking.findMany({
    where: {
      providerId,
      status: { not: 'CANCELLED' },
      endTime: { gte: new Date() },
    },
    orderBy: { startTime: 'asc' },
    select: { startTime: true, endTime: true },
  });
}

/** Bookings for one of a provider's businesses (provider dashboard). */
async function listForProvider(providerId: string) {
  return prisma.booking.findMany({
    where: { providerId },
    orderBy: { startTime: 'desc' },
    select: providerBookingSelect,
  });
}

/** Provider changes a booking's status (confirm / complete / cancel). */
async function updateStatus(
  providerId: string,
  bookingId: string,
  status: BookingStatus,
  reason?: string,
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.providerId !== providerId) throw ApiError.notFound('Booking not found');

  if (!PROVIDER_TRANSITIONS[booking.status].includes(status)) {
    throw ApiError.badRequest(
      `A ${booking.status.toLowerCase()} booking can't be marked ${status.toLowerCase()}.`,
    );
  }

  return prisma.booking.update({
    where: { id: bookingId },
    // Only store a reason when cancelling.
    data: { status, cancelReason: status === 'CANCELLED' ? reason ?? null : undefined },
    select: providerBookingSelect,
  });
}

/** Customer cancels their own upcoming booking. */
async function cancelByCustomer(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
    throw ApiError.badRequest('This booking can no longer be cancelled.');
  }
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    select: bookingSelect,
  });
}

/** Customer moves their booking to a new time (same service). */
async function rescheduleByCustomer(userId: string, bookingId: string, startTime: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true },
  });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
    throw ApiError.badRequest('This booking can no longer be rescheduled.');
  }

  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Invalid start time');
  if (start.getTime() < Date.now()) throw ApiError.badRequest('Pick a time in the future');

  const end = new Date(start.getTime() + booking.service.durationMin * 60_000);

  try {
    return await prisma.booking.update({
      where: { id: bookingId },
      data: { startTime: start, endTime: end, status: 'PENDING' },
      select: bookingSelect,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('That slot was just taken. Please pick another time.');
    }
    throw err;
  }
}

export const bookingService = {
  create,
  listMine,
  bookedSlots,
  listForProvider,
  updateStatus,
  cancelByCustomer,
  rescheduleByCustomer,
};

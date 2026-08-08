import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { CreateBookingInput } from './booking.types';

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
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      amountMinor: true,
      currency: true,
      service: { select: { name: true } },
      user: { select: { fullName: true, phone: true } },
    },
  });
}

const bookingSelect = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  amountMinor: true,
  currency: true,
  service: { select: { name: true, durationMin: true } },
  provider: {
    select: { id: true, businessName: true, category: { select: { slug: true, name: true } } },
  },
} satisfies Prisma.BookingSelect;

export const bookingService = { create, listMine, bookedSlots, listForProvider };

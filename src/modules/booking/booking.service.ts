import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { notificationService } from '@/modules/notification/notification.service';
import { couponService } from '@/modules/coupon/coupon.service';
import { CreateBookingInput } from './booking.types';

// Customer-facing copy for the statuses a provider can move a booking to.
const BOOKING_STATUS_COPY: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: 'Your booking has been confirmed',
  COMPLETED: 'Your booking is complete — thank you!',
  CANCELLED: 'Your booking was cancelled',
  NO_SHOW: 'You were marked as a no-show',
};

// What the customer app sees for each booking.
const bookingSelect = {
  id: true,
  status: true,
  startTime: true,
  endTime: true,
  amountMinor: true,
  discountMinor: true,
  couponCode: true,
  amountPaidMinor: true,
  currency: true,
  paymentMethod: true,
  paymentStatus: true,
  cancelReason: true,
  service: { select: { id: true, name: true, durationMin: true } },
  provider: {
    select: { id: true, businessName: true, images: true, category: { select: { slug: true, name: true } } },
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
  amountPaidMinor: true,
  currency: true,
  paymentMethod: true,
  paymentStatus: true,
  cancelReason: true,
  service: { select: { name: true } },
  user: { select: { fullName: true, phone: true } },
} satisfies Prisma.BookingSelect;

// Provider dashboard across ALL of an owner's businesses — adds the business name.
const ownerBookingSelect = {
  ...providerBookingSelect,
  provider: { select: { id: true, businessName: true } },
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

  // Apply a coupon (if any) to the service price; the discount comes off the total.
  const subtotal = service.priceMinor;
  let discountMinor = 0;
  let appliedCoupon: { id: string; code: string } | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: {
        providerId_code: {
          providerId: input.providerId,
          code: couponService.normalizeCode(input.couponCode),
        },
      },
    });
    if (!coupon) throw ApiError.badRequest('That code isn’t valid for this business.');
    const evaluated = couponService.evaluateCoupon(coupon, {
      subtotalMinor: subtotal,
      serviceId: service.id,
    });
    if (evaluated.error) throw ApiError.badRequest(evaluated.error);
    discountMinor = evaluated.discountMinor;
    appliedCoupon = { id: coupon.id, code: coupon.code };
  }
  const total = subtotal - discountMinor;

  let booking;
  try {
    booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          userId,
          providerId: input.providerId,
          serviceId: service.id,
          startTime: start,
          endTime: end,
          status: 'PENDING',
          notes: input.notes,
          amountMinor: total,
          discountMinor,
          couponCode: appliedCoupon?.code ?? null,
          currency: service.currency,
          paymentMethod: input.paymentMethod ?? 'ONLINE',
        },
        select: bookingSelect,
      });
      if (appliedCoupon) {
        await tx.coupon.update({
          where: { id: appliedCoupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }
      return created;
    });
  } catch (err) {
    // @@unique([providerId, startTime]) → someone grabbed this slot first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('That slot was just taken. Please pick another time.');
    }
    throw err;
  }

  // Notify the business owner about the new booking request.
  const owner = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: { userId: true },
  });
  if (owner) {
    await notificationService.notify({
      userId: owner.userId,
      type: 'BOOKING_PLACED',
      title: 'New booking',
      body: `New booking request for ${service.name}`,
      entityType: 'BOOKING',
      entityId: booking.id,
    });
  }

  return booking;
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

/** Every booking across all businesses owned by this provider (dashboard). */
async function listForOwner(userId: string) {
  return prisma.booking.findMany({
    where: { provider: { userId } },
    orderBy: { startTime: 'desc' },
    select: ownerBookingSelect,
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

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    // Only store a reason when cancelling.
    data: { status, cancelReason: status === 'CANCELLED' ? reason ?? null : undefined },
    select: providerBookingSelect,
  });

  // Keep the customer posted on their booking.
  const copy = BOOKING_STATUS_COPY[status];
  if (copy) {
    await notificationService.notify({
      userId: booking.userId,
      type: 'BOOKING_STATUS',
      title: 'Booking update',
      body: status === 'CANCELLED' && reason ? `${copy}: ${reason}` : copy,
      entityType: 'BOOKING',
      entityId: bookingId,
    });
  }

  return updated;
}

/** Customer cancels their own upcoming booking. */
async function cancelByCustomer(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
    throw ApiError.badRequest('This booking can no longer be cancelled.');
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
    select: bookingSelect,
  });

  // Let the business owner know the customer cancelled.
  const owner = await prisma.provider.findUnique({
    where: { id: booking.providerId },
    select: { userId: true },
  });
  if (owner) {
    await notificationService.notify({
      userId: owner.userId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking cancelled',
      body: 'A customer cancelled their booking',
      entityType: 'BOOKING',
      entityId: bookingId,
    });
  }

  return updated;
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
  listForOwner,
  updateStatus,
  cancelByCustomer,
  rescheduleByCustomer,
};

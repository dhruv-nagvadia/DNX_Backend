import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { refundPayment } from '@/lib/razorpay';
import { haversineKm } from '@/utils/geo';
import { notificationService, formatINR } from '@/modules/notification/notification.service';
import { platformCouponService, ResolvedCheckoutCoupon } from '@/modules/platformCoupon/platformCoupon.service';
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
  serviceAddressLine: true,
  travelFeeMinor: true,
  service: { select: { id: true, name: true, durationMin: true, travelRequired: true } },
  provider: {
    select: {
      id: true,
      businessName: true,
      images: true,
      phone: true,
      category: { select: { slug: true, name: true } },
    },
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
  serviceAddressLine: true,
  serviceLat: true,
  serviceLng: true,
  travelFeeMinor: true,
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

  // On-location service — the provider travels to the customer, so we need
  // somewhere to go and a distance-based fee to add to the total.
  let travelFeeMinor = 0;
  let serviceAddressLine: string | null = null;
  let serviceLat: number | null = null;
  let serviceLng: number | null = null;
  if (service.travelRequired) {
    if (!input.serviceAddress) {
      throw ApiError.badRequest('Choose an address for this on-location service.');
    }
    const provider = await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { latitude: true, longitude: true },
    });
    const distanceKm =
      provider?.latitude != null &&
      provider?.longitude != null &&
      input.serviceAddress.latitude != null &&
      input.serviceAddress.longitude != null
        ? haversineKm(
            provider.latitude,
            provider.longitude,
            input.serviceAddress.latitude,
            input.serviceAddress.longitude,
          )
        : 0;
    travelFeeMinor = service.travelBaseFeeMinor + Math.round(service.travelPerKmMinor * distanceKm);
    serviceAddressLine = input.serviceAddress.line;
    serviceLat = input.serviceAddress.latitude ?? null;
    serviceLng = input.serviceAddress.longitude ?? null;
  }

  const start = new Date(input.startTime);
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Invalid start time');
  if (start.getTime() < Date.now()) throw ApiError.badRequest('Pick a time in the future');

  const end = new Date(start.getTime() + service.durationMin * 60_000);

  // Apply a coupon (if any) to the service price; the discount comes off the total.
  // Checked against this business's own coupons first, then platform-wide ones.
  const subtotal = service.priceMinor;
  let discountMinor = 0;
  let appliedCoupon: ResolvedCheckoutCoupon | null = null;
  if (input.couponCode) {
    appliedCoupon = await platformCouponService.resolveCheckoutCoupon(
      input.providerId,
      input.couponCode,
      { subtotalMinor: subtotal, serviceId: service.id, categoryId: service.categoryId },
      'BOOKING',
    );
    discountMinor = appliedCoupon.discountMinor;
  }
  // Travel fee is a separate surcharge, added after the (service-only) discount.
  const total = subtotal - discountMinor + travelFeeMinor;

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
          serviceAddressLine,
          serviceLat,
          serviceLng,
          travelFeeMinor,
        },
        select: bookingSelect,
      });
      if (appliedCoupon) {
        await platformCouponService.redeem(tx, appliedCoupon);
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

  // Cancelling a paid booking refunds what was paid via Razorpay (a no-op for
  // cash/test-mode payments).
  const refund =
    status === 'CANCELLED' && booking.paymentStatus !== 'REFUNDED'
      ? Math.max(0, booking.amountPaidMinor)
      : 0;
  const refunded = refund > 0 ? await refundPayment(booking.paymentRef, refund) : false;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      // Only store a reason when cancelling.
      cancelReason: status === 'CANCELLED' ? reason ?? null : undefined,
      ...(refunded ? { paymentStatus: 'REFUNDED' as const } : {}),
    },
    select: providerBookingSelect,
  });

  // Keep the customer posted on their booking.
  const copy = BOOKING_STATUS_COPY[status];
  if (copy) {
    let body = copy;
    if (status === 'CANCELLED' && refund > 0) {
      body = refunded
        ? `${copy} — ${formatINR(refund)} has been refunded`
        : `${copy} — your ${formatINR(refund)} refund is still being processed`;
    }
    if (status === 'CANCELLED' && reason) body += `: ${reason}`;
    await notificationService.notify({
      userId: booking.userId,
      type: 'BOOKING_STATUS',
      title: 'Booking update',
      body,
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

  // Any money already paid is refunded via Razorpay (a no-op for cash/test-mode payments).
  const refund = booking.paymentStatus === 'REFUNDED' ? 0 : Math.max(0, booking.amountPaidMinor);
  const refunded = refund > 0 ? await refundPayment(booking.paymentRef, refund) : false;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED', ...(refunded ? { paymentStatus: 'REFUNDED' as const } : {}) },
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
      body:
        'A customer cancelled their booking' + (refunded ? ` — ${formatINR(refund)} refunded` : ''),
      entityType: 'BOOKING',
      entityId: bookingId,
    });
  }

  // Confirm the refund to the customer — or flag it for manual follow-up if
  // the Razorpay refund itself failed (rare; the booking is still cancelled).
  if (refund > 0) {
    await notificationService.notify({
      userId,
      type: 'BOOKING_STATUS',
      title: refunded ? 'Refund issued' : 'Refund pending',
      body: refunded
        ? `${formatINR(refund)} has been refunded for your cancelled booking`
        : `Your cancelled booking's ${formatINR(refund)} refund is still being processed — contact support if it doesn't appear soon.`,
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

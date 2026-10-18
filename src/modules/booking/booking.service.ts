import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/ApiError';
import { refundPayment } from '@/lib/razorpay';
import { haversineKm } from '@/utils/geo';
import { notificationService, formatINR } from '@/modules/notification/notification.service';
import { platformCouponService, ResolvedCheckoutCoupon } from '@/modules/platformCoupon/platformCoupon.service';
import { commissionService } from '@/modules/commission/commission.service';
import { settledAtFor } from '@/modules/commission/commission.calc';
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
  CONFIRMED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

// A no-show forfeits whatever was paid instead of refunding it — this many
// repeat no-shows (on a CASH booking, where there's nothing to forfeit)
// escalates the warning to mention charges/blocking.
const NO_SHOW_WARNING_THRESHOLD = 3;

/** Books a service slot for the customer. */
async function create(userId: string, input: CreateBookingInput) {
  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || service.providerId !== input.providerId || !service.isActive) {
    throw ApiError.badRequest('That service is not available');
  }

  const method = input.paymentMethod ?? 'ONLINE';
  if (method === 'CASH') {
    const customer = await prisma.user.findUnique({ where: { id: userId }, select: { codDisabled: true } });
    if (customer?.codDisabled) {
      throw ApiError.badRequest(
        'Cash on Delivery isn’t available for your account — pay online or with a partial deposit instead.',
      );
    }
  }
  if (method === 'PARTIAL') {
    if (!service.partialPayEnabled) {
      throw ApiError.badRequest('Partial payment isn’t available for this service.');
    }
    const partialProvider = await prisma.provider.findUnique({
      where: { id: input.providerId },
      select: { partialPayEnabled: true },
    });
    if (!partialProvider?.partialPayEnabled) {
      throw ApiError.badRequest('This business doesn’t accept partial payment.');
    }
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
  const commissionBps = await commissionService.rateBpsFor(input.providerId);

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
          paymentMethod: method,
          serviceAddressLine,
          serviceLat,
          serviceLng,
          travelFeeMinor,
          // The platform's cut is fixed now, so a later rate change never
          // rewrites what this booking was agreed under.
          commissionBps,
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
  // A no-show can only be called once the appointment was actually due —
  // stops a provider from forfeiting a customer's money pre-emptively.
  if (status === 'NO_SHOW' && booking.startTime.getTime() > Date.now()) {
    throw ApiError.badRequest('You can only mark a booking no-show after its start time.');
  }

  // Cancelling a paid booking refunds what was paid via Razorpay (a no-op for
  // cash/test-mode payments). A no-show forfeits it instead — no refund.
  const refund =
    status === 'CANCELLED' && booking.paymentStatus !== 'REFUNDED'
      ? Math.max(0, booking.amountPaidMinor)
      : 0;
  const refunded = refund > 0 ? await refundPayment(booking.paymentRef, refund) : false;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      // Stored for cancelling and no-showing (an optional provider note).
      cancelReason: status === 'CANCELLED' || status === 'NO_SHOW' ? reason ?? null : undefined,
      settledAt: settledAtFor(status),
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
    } else if (status === 'NO_SHOW') {
      if (booking.paymentMethod === 'CASH') {
        // The status update above already landed, so this booking itself is
        // counted here too — the raw count already includes it.
        const totalNoShows = await prisma.booking.count({
          where: { userId: booking.userId, status: 'NO_SHOW' },
        });
        body =
          totalNoShows >= NO_SHOW_WARNING_THRESHOLD
            ? `${copy} — repeated no-shows may lead to charges or your account being blocked.`
            : `${copy} — please show up for your upcoming bookings.`;
      } else if (booking.amountPaidMinor > 0) {
        body = `${copy} — your payment isn't refundable since you didn't show up. Reschedule instead next time to avoid this.`;
      }
    }
    if ((status === 'CANCELLED' || status === 'NO_SHOW') && reason) body += `: ${reason}`;
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

  // Cancelling after the appointment's start time forfeits the payment —
  // functionally the same as not showing up. Only a cancellation made while
  // there's still time to spare gets refunded.
  const isPastStart = booking.startTime.getTime() <= Date.now();
  const refund =
    !isPastStart && booking.paymentStatus !== 'REFUNDED' ? Math.max(0, booking.amountPaidMinor) : 0;
  const refunded = refund > 0 ? await refundPayment(booking.paymentRef, refund) : false;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'CANCELLED',
      settledAt: new Date(),
      ...(refunded ? { paymentStatus: 'REFUNDED' as const } : {}),
    },
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
        'A customer cancelled their booking' +
        (refunded
          ? ` — ${formatINR(refund)} refunded`
          : isPastStart && booking.amountPaidMinor > 0
            ? ' — after the start time, so the payment was not refunded'
            : ''),
      entityType: 'BOOKING',
      entityId: bookingId,
    });
  }

  // Confirm the refund to the customer, explain why there isn't one when
  // cancelling late, or flag a real Razorpay failure for manual follow-up.
  if (isPastStart && booking.amountPaidMinor > 0) {
    await notificationService.notify({
      userId,
      type: 'BOOKING_STATUS',
      title: 'Booking cancelled',
      body: "Your payment isn't refundable since you cancelled after the appointment's start time.",
      entityType: 'BOOKING',
      entityId: bookingId,
    });
  } else if (refund > 0) {
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

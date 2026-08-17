import crypto from 'crypto';
import { BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { env } from '@/config';
import { ApiError } from '@/utils/ApiError';
import { isRazorpayConfigured, razorpay } from '@/lib/razorpay';

async function getOwnedBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { user: true, provider: { select: { businessName: true, depositPercent: true } } },
  });
  if (!booking || booking.userId !== userId) throw ApiError.notFound('Booking not found');
  return booking;
}

type OwnedBooking = Awaited<ReturnType<typeof getOwnedBooking>>;

/** How much to charge online now: the deposit for PARTIAL, the full amount for ONLINE. */
function chargeFor(booking: OwnedBooking): number {
  const total = booking.amountMinor ?? 0;
  if (booking.paymentMethod === 'PARTIAL') {
    // Default to 20% when the provider hasn't configured a deposit.
    const pct = booking.provider.depositPercent || 20;
    return Math.max(100, Math.round((total * pct) / 100)); // at least ₹1
  }
  return total;
}

async function getPayableBooking(userId: string, bookingId: string) {
  const booking = await getOwnedBooking(userId, bookingId);
  if (booking.status === 'CANCELLED') throw ApiError.badRequest('This booking was cancelled');
  if (booking.paymentMethod === 'CASH') {
    throw ApiError.badRequest('This is a cash booking — pay at the venue.');
  }
  if (booking.paymentStatus === 'PAID' || booking.amountPaidMinor > 0) {
    throw ApiError.badRequest('This booking is already paid');
  }
  if (!booking.amountMinor) throw ApiError.badRequest('This booking has no amount to pay');
  return booking;
}

/** Records a payment (sets amount paid, derives PAID vs PARTIAL, auto-confirms). */
async function markPaid(bookingId: string, paidMinor: number, paymentRef: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  const total = booking.amountMinor ?? 0;
  const paymentStatus = total > 0 && paidMinor >= total ? 'PAID' : 'PARTIAL';
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      amountPaidMinor: paidMinor,
      paymentStatus,
      paymentRef,
      ...(booking.status === ('PENDING' as BookingStatus) ? { status: 'CONFIRMED' } : {}),
    },
  });
}

/** Creates a Razorpay payment link for the online charge (or signals test mode). */
async function createPaymentLink(userId: string, bookingId: string) {
  const booking = await getPayableBooking(userId, bookingId);
  const amount = chargeFor(booking);
  const currency = booking.currency ?? 'INR';

  if (!isRazorpayConfigured()) {
    return { simulated: true as const, amount, currency };
  }

  const link = await razorpay().paymentLink.create({
    amount,
    currency,
    accept_partial: false,
    reference_id: `${booking.id}-${Date.now()}`,
    description: `Booking at ${booking.provider.businessName}`,
    customer: { name: booking.user.fullName, email: booking.user.email },
    notify: { sms: false, email: false },
    reminder_enable: false,
    notes: { bookingId: booking.id },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { razorpayOrderId: String(link.id) },
  });
  return { simulated: false as const, url: link.short_url as string, amount, currency };
}

/** Test-mode completion (only when live keys aren't set). */
async function simulatePayment(userId: string, bookingId: string) {
  if (isRazorpayConfigured()) {
    throw ApiError.badRequest('Live payments are enabled — complete the payment link instead.');
  }
  const booking = await getPayableBooking(userId, bookingId);
  const charge = chargeFor(booking);
  await markPaid(booking.id, charge, `sim_${Date.now()}`);
  const total = booking.amountMinor ?? 0;
  return { bookingId: booking.id, paymentStatus: charge >= total ? 'PAID' : 'PARTIAL' };
}

/** Client-triggered reconciliation with Razorpay (fallback when no webhook). */
async function syncPayment(userId: string, bookingId: string) {
  const booking = await getOwnedBooking(userId, bookingId);
  if (booking.paymentStatus !== 'PENDING') return { paymentStatus: booking.paymentStatus };
  if (!isRazorpayConfigured() || !booking.razorpayOrderId) {
    return { paymentStatus: booking.paymentStatus };
  }

  const link = (await razorpay().paymentLink.fetch(booking.razorpayOrderId)) as unknown as {
    status?: string;
    amount_paid?: number;
    amount?: number;
    payments?: Array<{ payment_id?: string }>;
  };
  if (link.status === 'paid') {
    const paid = link.amount_paid ?? link.amount ?? chargeFor(booking);
    const ref = link.payments?.[0]?.payment_id ?? String(booking.razorpayOrderId);
    await markPaid(booking.id, paid, ref);
    return { paymentStatus: paid >= (booking.amountMinor ?? 0) ? 'PAID' : 'PARTIAL' };
  }
  return { paymentStatus: booking.paymentStatus };
}

/** Razorpay → server webhook. The real source of truth for live payments. */
async function handleWebhook(rawBody: Buffer, signature?: string) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) throw ApiError.badRequest('Webhook not configured');

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (expected !== signature) throw ApiError.unauthorized('Invalid webhook signature');

  const event = JSON.parse(rawBody.toString());
  if (event.event === 'payment_link.paid') {
    const link = event.payload?.payment_link?.entity;
    const paymentId: string = event.payload?.payment?.entity?.id ?? 'razorpay';
    const paid: number = link?.amount_paid ?? event.payload?.payment?.entity?.amount ?? 0;
    const bookingId: string | undefined =
      link?.notes?.bookingId ??
      (link?.reference_id ? String(link.reference_id).split('-')[0] : undefined);
    if (bookingId) {
      const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (booking && booking.paymentStatus === 'PENDING') {
        await markPaid(booking.id, paid, paymentId);
      }
    }
  }
  return { received: true };
}

export const paymentService = { createPaymentLink, simulatePayment, syncPayment, handleWebhook };

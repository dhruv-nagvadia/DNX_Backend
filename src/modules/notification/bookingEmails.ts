import { BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isEmailConfigured, sendEmail } from '@/lib/email';
import { logger } from '@/utils/logger';
import { formatINR } from './notification.service';
import { DetailRow, formatDateTimeIST, simpleEmailHtml } from './emailTemplates';

/**
 * Booking lifecycle emails. Every entry point is fire-and-forget: it returns
 * immediately, loads what it needs on its own, skips silently when email
 * isn't configured, and never throws into the booking flow.
 */

export type BookingEmailEvent =
  /** Customer booked → confirmation to the customer + "New booking" to the owner. */
  | { kind: 'created' }
  /** Provider accepted the booking → customer. */
  | { kind: 'confirmed' }
  /** Provider cancelled → customer. `note` carries refund/reason copy. */
  | { kind: 'cancelledByProvider'; note?: string }
  /** Nobody confirmed it before the start time → customer + owner. */
  | { kind: 'expired'; note?: string }
  /** Customer cancelled → owner. */
  | { kind: 'cancelledByCustomer'; note?: string }
  /** Customer moved it → owner. */
  | { kind: 'rescheduledByCustomer'; previousStart: Date };

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

const PAYMENT_LABEL: Record<string, string> = {
  ONLINE: 'Online',
  CASH: 'Cash at the appointment',
  PARTIAL: 'Partial (deposit online)',
};

async function load(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startTime: true,
      amountMinor: true,
      amountPaidMinor: true,
      paymentMethod: true,
      cancelReason: true,
      serviceAddressLine: true,
      service: { select: { name: true } },
      user: { select: { email: true, fullName: true, phone: true } },
      provider: {
        select: {
          businessName: true,
          phone: true,
          addressLine: true,
          city: true,
          postalCode: true,
          user: { select: { email: true } },
        },
      },
    },
  });
}

type LoadedBooking = NonNullable<Awaited<ReturnType<typeof load>>>;

function details(b: LoadedBooking, audience: 'customer' | 'provider'): DetailRow[] {
  const businessAddress = [b.provider.addressLine, b.provider.city, b.provider.postalCode]
    .filter(Boolean)
    .join(', ');
  const rows: DetailRow[] = [
    audience === 'customer'
      ? ['Business', b.provider.businessName]
      : ['Customer', [b.user.fullName, b.user.phone].filter(Boolean).join(' · ')],
    ['Service', b.service.name],
    ['When', formatDateTimeIST(b.startTime)],
    b.serviceAddressLine
      ? ['Address', `${b.serviceAddressLine} (on-location)`]
      : ['Address', businessAddress],
    ['Amount', b.amountMinor != null ? formatINR(b.amountMinor) : null],
    ['Paid so far', b.amountPaidMinor > 0 ? formatINR(b.amountPaidMinor) : null],
    ['Payment', PAYMENT_LABEL[b.paymentMethod] ?? b.paymentMethod],
    ['Status', STATUS_LABEL[b.status]],
  ];
  if (audience === 'customer') rows.push(['Business phone', b.provider.phone]);
  if (b.status === 'CANCELLED' && b.cancelReason) rows.push(['Reason', b.cancelReason]);
  return rows;
}

async function send(bookingId: string, event: BookingEmailEvent): Promise<void> {
  if (!isEmailConfigured()) return;
  const b = await load(bookingId);
  if (!b) return;

  const customer = (subject: string, intro: string, outro?: string) =>
    sendEmail(
      b.user.email,
      subject,
      simpleEmailHtml({ intro, details: details(b, 'customer'), outro }),
    );
  const owner = (subject: string, intro: string, outro?: string) =>
    sendEmail(
      b.provider.user.email,
      subject,
      simpleEmailHtml({ intro, details: details(b, 'provider'), outro }),
    );
  const biz = b.provider.businessName;

  switch (event.kind) {
    case 'created':
      await Promise.all([
        customer(
          `Booking received — ${b.service.name}`,
          `Hi ${b.user.fullName}, your booking with ${biz} has been received.`,
          b.status === 'PENDING'
            ? "We'll let you know as soon as the business confirms it."
            : undefined,
        ),
        owner(
          `New booking — ${b.service.name}`,
          `You have a new booking request at ${biz}.`,
          'Open your DNX dashboard to confirm or decline it before the start time.',
        ),
      ]);
      break;
    case 'confirmed':
      await customer(
        `Booking confirmed — ${b.service.name}`,
        `Good news! ${biz} has confirmed your booking.`,
      );
      break;
    case 'cancelledByProvider':
      await customer(
        `Booking cancelled — ${b.service.name}`,
        `${biz} has cancelled your booking.`,
        event.note,
      );
      break;
    case 'expired':
      await Promise.all([
        customer(
          `Booking cancelled — ${b.service.name}`,
          `Your booking with ${biz} was cancelled because the business didn't confirm it in time.`,
          event.note,
        ),
        owner(
          `Booking expired — ${b.service.name}`,
          `A booking at ${biz} was cancelled automatically because it wasn't confirmed before its start time.`,
        ),
      ]);
      break;
    case 'cancelledByCustomer':
      await owner(
        `Booking cancelled by customer — ${b.service.name}`,
        `${b.user.fullName} cancelled their booking at ${biz}.`,
        event.note,
      );
      break;
    case 'rescheduledByCustomer':
      await owner(
        `Booking rescheduled — ${b.service.name}`,
        `${b.user.fullName} moved their booking at ${biz} from ${formatDateTimeIST(event.previousStart)} to ${formatDateTimeIST(b.startTime)}.`,
        'It needs your confirmation again — open your DNX dashboard to confirm it.',
      );
      break;
  }
}

/** Sends the emails for a booking event in the background. Never throws. */
export function emailBookingEvent(bookingId: string, event: BookingEmailEvent): void {
  send(bookingId, event).catch((err) => logger.error('Failed to send booking email', err));
}

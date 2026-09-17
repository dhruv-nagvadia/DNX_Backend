import Razorpay from 'razorpay';
import { env } from '@/config';
import { logger } from '@/utils/logger';

/** True when live Razorpay keys are set; otherwise the app runs in test mode. */
export function isRazorpayConfigured(): boolean {
  return !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;
}

let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (!client) {
    client = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID as string,
      key_secret: env.RAZORPAY_KEY_SECRET as string,
    });
  }
  return client;
}

/** A payment ref that isn't a real Razorpay payment id (test-mode/cash markers). */
function isRealPaymentRef(paymentRef: string | null | undefined): paymentRef is string {
  return !!paymentRef && !paymentRef.startsWith('sim_') && !paymentRef.startsWith('cash_');
}

/**
 * Refunds what was actually paid for a cancelled booking/order. Returns true
 * when it's safe to mark the record REFUNDED — either a real Razorpay refund
 * succeeded, or there was never a real gateway payment to refund (test-mode
 * simulation or cash collected in person), so the REFUNDED flag is just
 * bookkeeping. Returns false only when a real refund was attempted and
 * genuinely failed — the caller should leave the payment status as-is (still
 * PAID/PARTIAL) so a cancelled-but-unrefunded record stays visibly flagged
 * for manual follow-up, instead of silently claiming money moved when it didn't.
 */
export async function refundPayment(paymentRef: string | null | undefined, amountMinor: number): Promise<boolean> {
  if (amountMinor <= 0) return true;
  if (!isRealPaymentRef(paymentRef) || !isRazorpayConfigured()) return true;

  try {
    await razorpay().payments.refund(paymentRef, { amount: amountMinor, speed: 'normal' });
    return true;
  } catch (err) {
    logger.error('Razorpay refund failed', { paymentRef, amountMinor, err });
    return false;
  }
}

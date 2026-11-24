/**
 * Pure money math for platform commission. No database access here, so every
 * rule below can be unit-checked by hand. Amounts are minor units (paise);
 * rates are basis points (1000 = 10%).
 */

export interface GatewayFeeConfig {
  gatewayFeeBps: number;
  gatewayFeeFlatMinor: number;
  gatewayFeeAboveMinor: number;
  gatewayFeeCapMinor: number;
}

/** The slice of a booking/order the commission math needs. */
export interface LedgerRecord {
  status: string;
  paymentStatus: string;
  amountMinor: number;
  amountPaidMinor: number;
  /** Orders track partial refunds; bookings are refunded in full or not at all. */
  refundedMinor: number;
  commissionBps: number;
  onlinePaidMinor: number;
  /** Gateway fee charged on this sale's online payment (snapshot when paid). */
  gatewayFeeMinor: number;
}

export type LedgerState = 'EARNED' | 'UPCOMING' | 'NONE';

export interface LedgerEntry {
  /**
   * EARNED   – finished (completed, or cancelled/no-show with money kept).
   * UPCOMING – still open; what it will be worth if it completes.
   * NONE     – finished with nothing kept (cancelled and fully refunded).
   */
  state: LedgerState;
  /** Sale value the platform and provider share. */
  keptMinor: number;
  commissionMinor: number;
  /**
   * The gateway fee passed on to the provider (provider terms: the ~2% online
   * payment fee comes out of their payout). Only on online money DNX still
   * holds — a fully refunded sale passes on nothing (DNX absorbs that fee),
   * and a partial refund passes on the fee for the part that was kept.
   */
  providerFeeMinor: number;
  /** keptMinor − commissionMinor − providerFeeMinor: the provider's share. */
  earningMinor: number;
  /**
   * What this sale adds to what DNX pays the provider: online money held minus
   * commission and the passed-on gateway fee. Negative for a cash sale with
   * commission (taken off what DNX owes them).
   */
  payableMinor: number;
  /** Money still sitting with the platform for this sale (online, net of refunds). */
  onlineHeldMinor: number;
  /** Part of the sale the provider collected in person. */
  cashMinor: number;
}

export function percentToBps(percent: number): number {
  return Math.round(percent * 100);
}

export function bpsToPercent(bps: number): number {
  return bps / 100;
}

export function commissionOf(amountMinor: number, bps: number): number {
  if (amountMinor <= 0 || bps <= 0) return 0;
  return Math.min(amountMinor, Math.round((amountMinor * bps) / 10_000));
}

/** Estimated gateway fee on one online payment, per the admin-set rules. */
export function gatewayFeeOf(onlineMinor: number, cfg: GatewayFeeConfig): number {
  if (onlineMinor <= 0) return 0;
  if (cfg.gatewayFeeAboveMinor > 0 && onlineMinor <= cfg.gatewayFeeAboveMinor) return 0;
  let fee = Math.round((onlineMinor * cfg.gatewayFeeBps) / 10_000) + cfg.gatewayFeeFlatMinor;
  if (cfg.gatewayFeeCapMinor > 0) fee = Math.min(fee, cfg.gatewayFeeCapMinor);
  return Math.max(0, fee);
}

/**
 * The share of a sale's gateway fee passed on to the provider: the fee scaled
 * to the online money still held (so refunds reduce it), and nothing for a
 * sale that ended with nothing kept.
 */
export function providerFeeOf(
  state: LedgerState,
  gatewayFeeMinor: number,
  onlinePaidMinor: number,
  onlineHeldMinor: number,
): number {
  if (state === 'NONE' || gatewayFeeMinor <= 0 || onlinePaidMinor <= 0 || onlineHeldMinor <= 0) return 0;
  if (onlineHeldMinor >= onlinePaidMinor) return gatewayFeeMinor;
  return Math.round((gatewayFeeMinor * onlineHeldMinor) / onlinePaidMinor);
}

const FINISHED = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

export function isFinished(status: string): boolean {
  return FINISHED.has(status);
}

/** Value for `settledAt` when a booking/order moves to `status` (unset while it's still open). */
export function settledAtFor(status: string): Date | undefined {
  return isFinished(status) ? new Date() : undefined;
}

/**
 * Works out what a booking/order is worth to the platform and the provider.
 *
 * - Completed → the full sale value.
 * - Cancelled / no-show → only what was paid and *not* refunded (a no-show
 *   forfeits the payment; a fully-refunded cancellation is worth nothing, and
 *   a partial refund keeps the remainder). So a refund automatically reverses
 *   the commission on the refunded part — there is no separate step to forget.
 * - Still open → "upcoming": the value if it completes as booked.
 */
export function settle(rec: LedgerRecord): LedgerEntry {
  const total = Math.max(0, rec.amountMinor);
  const finished = isFinished(rec.status);

  let kept: number;
  if (!finished) kept = total;
  else if (rec.status === 'COMPLETED') kept = total;
  else kept = rec.paymentStatus === 'REFUNDED' ? 0 : Math.max(0, rec.amountPaidMinor - rec.refundedMinor);

  const state: LedgerState = !finished ? 'UPCOMING' : kept > 0 ? 'EARNED' : 'NONE';

  const refundedOnline =
    rec.paymentStatus === 'REFUNDED'
      ? rec.onlinePaidMinor
      : Math.min(Math.max(0, rec.refundedMinor), rec.onlinePaidMinor);
  const onlineHeld = Math.max(0, rec.onlinePaidMinor - refundedOnline);

  const commission = state === 'NONE' ? 0 : commissionOf(kept, rec.commissionBps);
  const providerFee = providerFeeOf(state, rec.gatewayFeeMinor, rec.onlinePaidMinor, onlineHeld);

  return {
    state,
    keptMinor: kept,
    commissionMinor: commission,
    providerFeeMinor: providerFee,
    earningMinor: kept - commission - providerFee,
    payableMinor: onlineHeld - commission - providerFee,
    onlineHeldMinor: onlineHeld,
    cashMinor: Math.max(0, kept - onlineHeld),
  };
}

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
  /** keptMinor − commissionMinor: the provider's share. */
  earningMinor: number;
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

  return {
    state,
    keptMinor: kept,
    commissionMinor: commission,
    earningMinor: kept - commission,
    onlineHeldMinor: onlineHeld,
    cashMinor: Math.max(0, kept - onlineHeld),
  };
}

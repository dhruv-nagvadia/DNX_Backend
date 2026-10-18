# Payments (Razorpay)

Payments are **config-driven**. The same code runs in three modes depending on
which env vars are present — no code changes needed to go live.

## Modes

| Mode | Env | Behaviour |
| --- | --- | --- |
| **Simulation** (default) | no keys | `POST /customer/payments/link` returns `{ simulated: true }`; the app completes via `POST /customer/payments/simulate`. Great for demos with no account. |
| **Test / Live** | `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | A real Razorpay **Payment Link** is created; the app opens it in the browser. Status is reconciled via the webhook **and/or** `POST /customer/payments/sync` when the app returns to foreground. |

Test keys (`rzp_test_…`) need no KYC and work immediately. Live keys
(`rzp_live_…`) require account activation.

## Env (`.env`)

```
RAZORPAY_KEY_ID=            # Dashboard → Settings → API Keys
RAZORPAY_KEY_SECRET=        # shown once when you generate the key
RAZORPAY_WEBHOOK_SECRET=    # any string you set when creating the webhook
```

## Webhook (recommended for live)

Dashboard → **Settings → Webhooks → Add Webhook**:

- **URL:** `https://<your-api>/api/v1/payments/webhook`
- **Secret:** same value as `RAZORPAY_WEBHOOK_SECRET`
- **Events:** `payment_link.paid`

For local testing, expose the server with a tunnel (e.g. `ngrok http 4000`) and
use that URL. Even without a webhook, the app's `/sync` call on return
reconciles the payment, so keys alone are enough to start.

## Data

`Booking` carries `paymentStatus` (PENDING/PAID/FAILED/REFUNDED),
`razorpayOrderId` (payment-link id) and `paymentRef` (payment id). A successful
payment marks the booking **PAID** and auto-confirms it if it was pending.

## Commission & earnings

The platform keeps a percentage of every completed sale; the provider gets the
rest. **Customers always pay the listed price** — commission comes out of the
provider's side, never added on top.

- **Rate:** `PlatformConfig.commissionBps` (basis points, 1000 = 10%), editable
  from the admin console (**Finance**). A business can override it
  (`Provider.commissionBps`; null = follow the default). Capped at 50%.
- **Snapshot:** the rate in force is copied onto each booking/order when it's
  created (`commissionBps`), so changing the rate only affects new sales.
  Rows from before this feature have `commissionBps = 0` (no commission).
- **Counted when finished:** a sale's commission is counted when it is
  COMPLETED, or CANCELLED/NO_SHOW with money kept (a no-show forfeits the
  payment). A refund removes the commission on the refunded part automatically —
  nothing is stored that needs reversing. Open sales show as "upcoming".
  Math lives in `modules/commission/commission.calc.ts` (pure functions).
- **Online vs cash:** `onlinePaidMinor` is what went through the gateway (the
  platform holds it); cash collected in person never does. So the platform owes
  a provider *online money − commission*, and commission on cash sales is a
  debt the provider owes back. Balance = that, minus recorded settlements.
- **Payouts are manual:** pay providers by UPI/bank, then record it under
  Finance → Provider balances (`ProviderPayout`). Nothing here moves real money.
- **Gateway fee (estimate):** `gatewayFee*` settings model what the gateway
  charges (e.g. UPI 0.4% above ₹2,000, capped ₹300). Snapshotted per payment in
  `gatewayFeeMinor`; only affects the admin profit figure, never customers.
  Defaults to 0.

Endpoints: provider `GET /provider/earnings?from&to&businessId`; admin under
`/admin/finance/*` (overview, balances, businesses + per-business commission,
payouts, **transactions** and **breakdown**) and `PATCH /admin/config`.

**Transactions (admin):** `GET /admin/finance/transactions` lists every booking
and order with how it was paid (`onlineMinor` through the gateway, `cashMinor`
in person — for an open sale, what is still due), `commissionMinor`, and
`payableMinor` = online money held − commission. For a COD sale that is just
`−commission`: it is taken off what DNX owes the provider; for a partial
payment the commission comes out of the online deposit first. Filters: date
(when placed), business, service (bookings), provider account, payment type,
booking/order, status (`OPEN` = pending/confirmed/ready), search. The
`summary` covers the whole filter, not just the page. `GET
/admin/finance/breakdown?by=business|service` groups the same filter. Store
orders have no single service, so they appear under business, not service.

## One payment for a multi-store cart

A cart can hold products from several stores. The customer pays **once**; the
money is then split per store, so commission, refunds and what is owed to each
provider stay per-store.

- `POST /customer/payments/orders/checkout` takes `{ paymentMethod, groups: [{ providerId,
  items, couponCode? }, …] }` (the older single-store body still works). Every
  store's items are validated first — one unavailable item stops the whole thing
  before anything is charged — then ONE Razorpay Order is created for the total
  (each store's full price, or its own deposit for partial pay).
- Nothing is placed until the payment is confirmed (`/checkout/confirm`, the
  `/checkout/sync` fallback, or the webhook — whichever arrives first wins, the
  rest are no-ops). Confirming creates one `Order` per store; each records only
  **its own share** (`amountPaidMinor` / `onlinePaidMinor`) and shares the same
  `razorpayOrderId` and `paymentRef`.
- **Gateway fee** is charged on the *whole* payment, then shared across the
  orders in proportion (the last takes the rounding remainder, so the shares add
  up exactly). A "fee only above ₹X" rule therefore applies to the combined total.
- If one store's order can't be placed after the customer has paid (e.g. its
  product was removed), only that store's share is refunded and the customer is
  notified; the other stores' orders go through.
- Cancelling or refunding one store's order is a *partial* refund against the
  shared payment id, so the other stores' orders are untouched.
- Cash on Delivery has no payment, so it is still one independent order per store.
- Bookings are one service at a time, so they are unaffected.

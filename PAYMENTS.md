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

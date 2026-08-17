import Razorpay from 'razorpay';
import { env } from '@/config';

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

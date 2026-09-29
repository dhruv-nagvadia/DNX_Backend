import { Resend } from 'resend';
import { env } from '@/config';
import { logger } from '@/utils/logger';

/** True when a Resend API key is set; otherwise sends are skipped (logged only). */
export function isEmailConfigured(): boolean {
  return !!env.RESEND_API_KEY;
}

let client: Resend | null = null;

function resend(): Resend {
  if (!client) client = new Resend(env.RESEND_API_KEY as string);
  return client;
}

/**
 * Sends a transactional email, or logs and no-ops if Resend isn't configured
 * yet. `devPreview` (e.g. the OTP itself) is logged only in this unconfigured
 * case, so you can still exercise the flow end-to-end before signing up for
 * Resend — it's never included in the real email or logged once a key is set.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  devPreview?: string,
): Promise<void> {
  if (!isEmailConfigured()) {
    logger.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject, devPreview });
    return;
  }
  try {
    await resend().emails.send({ from: env.EMAIL_FROM, to, subject, html });
  } catch (err) {
    logger.error('Resend email send failed', { to, subject, err });
  }
}

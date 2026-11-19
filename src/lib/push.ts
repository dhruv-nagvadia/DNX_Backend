import fs from 'fs';
import path from 'path';
import { App, cert, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging, Messaging, MulticastMessage } from 'firebase-admin/messaging';
import { env } from '@/config';
import { logger } from '@/utils/logger';

/**
 * Firebase Cloud Messaging sender. Credentials come from
 * FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 of the service-account JSON) or
 * FIREBASE_SERVICE_ACCOUNT_PATH; with neither set, every send is a silent
 * no-op so the API runs fine without Firebase.
 */

// undefined = not initialised yet; null = push disabled (no/invalid credentials).
let messaging: Messaging | null | undefined;

function loadServiceAccount(): ServiceAccount | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return JSON.parse(Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const file = path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return null;
}

function client(): Messaging | null {
  if (messaging !== undefined) return messaging;
  try {
    const account = loadServiceAccount();
    if (!account) {
      logger.info('[push] Firebase credentials not set — push notifications disabled');
      messaging = null;
      return null;
    }
    const app: App = initializeApp({ credential: cert(account) }, 'dnx-push');
    messaging = getMessaging(app);
    logger.info('[push] Firebase Cloud Messaging enabled');
  } catch (err) {
    logger.error('[push] Invalid Firebase credentials — push notifications disabled', err);
    messaging = null;
  }
  return messaging;
}

/** Initialises FCM once at startup so its enabled/disabled state is logged up front. */
export function initPush(): void {
  client();
}

export function isPushEnabled(): boolean {
  return client() !== null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** FCM data values must be strings. */
  data: Record<string, string>;
  /** iOS app-icon badge (e.g. the unread count). */
  badge?: number;
}

// Error codes meaning the token will never work again — the app was
// uninstalled, the token rotated, or it was never valid.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// FCM's multicast limit per request.
const BATCH = 500;

/**
 * Sends one notification to each token. Returns the tokens FCM reported as
 * dead so the caller can delete them. Never throws.
 */
export async function sendPush(tokens: string[], payload: PushPayload): Promise<string[]> {
  const fcm = client();
  if (!fcm || tokens.length === 0) return [];

  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH);
    const message: MulticastMessage = {
      tokens: chunk,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: {
        priority: 'high',
        notification: { channelId: 'default', sound: 'default' },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
          },
        },
      },
    };
    try {
      const res = await fcm.sendEachForMulticast(message);
      res.responses.forEach((r, idx) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(chunk[idx]);
        else if (!r.success) logger.warn('[push] send failed', r.error?.code ?? r.error);
      });
    } catch (err) {
      logger.error('[push] FCM request failed', err);
    }
  }
  return dead;
}

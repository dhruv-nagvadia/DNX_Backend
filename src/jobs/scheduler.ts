import { logger } from '@/utils/logger';
import { runBookingReminders } from './bookingReminders.job';
import { runExpireUnconfirmedBookings } from './expireBookings.job';
import { runReminderDue } from './reminderDue.job';

/**
 * Minimal in-process scheduler: runs every job once a minute, one tick at a
 * time (a slow tick makes the next one skip rather than overlap). Every job is
 * idempotent via "sent at"/status columns, so a missed or repeated tick is
 * harmless. Runs in a single API instance — see SCHEDULER_ENABLED in env.ts.
 */

const TICK_MS = 60_000;
const FIRST_TICK_MS = 10_000;

const JOBS: Array<[name: string, run: () => Promise<unknown>]> = [
  ['expire-unconfirmed-bookings', () => runExpireUnconfirmedBookings()],
  ['booking-reminders', () => runBookingReminders()],
  ['reminder-due', () => runReminderDue()],
];

let interval: NodeJS.Timeout | null = null;
let firstTick: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;

async function tick(): Promise<void> {
  for (const [name, run] of JOBS) {
    try {
      await run();
    } catch (err) {
      logger.error(`[scheduler] job ${name} failed`, err);
    }
  }
}

function trigger(): void {
  if (running) return; // previous tick still going
  running = tick().finally(() => {
    running = null;
  });
}

export function startScheduler(): void {
  if (interval) return;
  firstTick = setTimeout(trigger, FIRST_TICK_MS);
  interval = setInterval(trigger, TICK_MS);
  logger.info('[scheduler] started (every 60s)');
}

/** Stops scheduling new ticks and waits for an in-flight one to finish. */
export async function stopScheduler(): Promise<void> {
  if (firstTick) clearTimeout(firstTick);
  if (interval) clearInterval(interval);
  firstTick = null;
  interval = null;
  if (running) await running;
}

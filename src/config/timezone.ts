/**
 * Pins the process to India time. Must be the FIRST import of every entry
 * point (src/server.ts, scripts): ES imports are hoisted and evaluated in
 * order, so importing this module first sets TZ before any other module (or
 * Node's Date internals) reads it.
 *
 * Why: business hours ("Open now", slot availability) and the reminder
 * scheduler compare HH:mm strings and calendar days against the server clock
 * via local-time Date methods (getHours/getDay/setHours). The platform serves
 * India only, so the server's "local" time must be IST regardless of where
 * it's hosted (cloud hosts default to UTC). An explicitly set TZ env var still
 * wins, e.g. for tests.
 */
if (!process.env.TZ) {
  process.env.TZ = 'Asia/Kolkata';
}

export {};

/**
 * Plain transactional email templates. Same minimal inline-styled HTML as the
 * password-reset email (auth.service.ts) — short copy, no images, so it reads
 * fine in every client and as plain text.
 */

const IST = 'Asia/Kolkata';

/** "Thu, 20 Nov 2026, 3:30 pm" in India time, regardless of server TZ. */
export function formatDateTimeIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** "3:30 pm" in India time. */
export function formatTimeIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** "20 Nov 2026" in India time. */
export function formatDateIST(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A label/value pair rendered as one detail line; empty values are skipped. */
export type DetailRow = [label: string, value: string | null | undefined];

/**
 * Builds the email body: an intro paragraph, an optional list of details, and
 * an optional closing note. All values are HTML-escaped here.
 */
export function simpleEmailHtml(opts: { intro: string; details?: DetailRow[]; outro?: string }) {
  const rows = (opts.details ?? [])
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#666">${escapeHtml(label)}</td>` +
        `<td style="padding:2px 0;font-weight:600">${escapeHtml(String(value))}</td></tr>`,
    )
    .join('');
  return `
  <p>${escapeHtml(opts.intro)}</p>
  ${rows ? `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>` : ''}
  ${opts.outro ? `<p>${escapeHtml(opts.outro)}</p>` : ''}
  <p style="color:#888;font-size:12px">— DNX</p>
`;
}

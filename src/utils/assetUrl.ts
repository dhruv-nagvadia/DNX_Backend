import { Request } from 'express';

/**
 * Asset paths are stored relative (e.g. "/assets/categories/beauty.jpg") so they
 * stay portable across environments; responses make them absolute using the
 * host the client called, so a phone on the LAN gets a URL it can reach.
 */
export function absoluteAsset(req: Request, url: string | null | undefined): string | null | undefined {
  if (!url || /^https?:\/\//.test(url)) return url;
  return `${req.protocol}://${req.get('host')}${url}`;
}

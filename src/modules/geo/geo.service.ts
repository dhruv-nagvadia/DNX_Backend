import { ReverseGeocodeResult } from './geo.types';

interface NominatimAddress {
  suburb?: string;
  neighbourhood?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
}

// Nominatim's usage policy requires every client to identify itself.
const USER_AGENT = 'DNX-Provider-App/1.0';

/**
 * Reverse-geocodes device coordinates via OpenStreetMap's Nominatim — free,
 * keyless, and (unlike BigDataCloud) reliably returns a real postal code for
 * Indian addresses. Called server-side because Nominatim doesn't send CORS
 * headers, so the browser can't call it directly.
 */
async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=17`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
  });
  if (!res.ok) {
    return { address: null, city: null, state: null, postalCode: null };
  }

  const data = (await res.json()) as NominatimResponse;
  const addr = data.address ?? {};

  const locality = addr.suburb ?? addr.neighbourhood ?? null;
  const city = addr.city ?? addr.town ?? addr.village ?? addr.state_district ?? addr.county ?? null;
  const state = addr.state ?? null;
  const postalCode = addr.postcode ?? null;
  const address = [locality, city].filter(Boolean).join(', ') || null;

  return { address, city, state, postalCode };
}

interface NominatimSearchResult {
  lat?: string;
  lon?: string;
}

/**
 * Best-effort forward-geocode: an approximate lat/lng for a postal code (or
 * city/state as a fallback) — used to fill in coordinates for an address the
 * customer typed manually (no GPS), so the travel fee can still be
 * estimated. Accuracy is postal-code-area level, not house-level.
 */
async function forwardGeocode(input: {
  postalCode?: string;
  city?: string;
  state?: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const params = new URLSearchParams({ format: 'json', limit: '1', country: 'India' });
  if (input.postalCode) {
    params.set('postalcode', input.postalCode);
  } else if (input.city || input.state) {
    params.set('q', [input.city, input.state].filter(Boolean).join(', '));
  } else {
    return null;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
    if (!res.ok) return null;

    const results = (await res.json()) as NominatimSearchResult[];
    const best = results[0];
    if (!best?.lat || !best?.lon) return null;

    const latitude = Number(best.lat);
    const longitude = Number(best.lon);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

export const geoService = { reverseGeocode, forwardGeocode };

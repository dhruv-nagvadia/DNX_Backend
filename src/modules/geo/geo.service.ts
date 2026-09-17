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

export const geoService = { reverseGeocode };

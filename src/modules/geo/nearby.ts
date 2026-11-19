import { haversineKm } from '@/utils/geo';
import { geoService } from './geo.service';

/**
 * "Near me" search rings. Results come from the smallest ring that has at
 * least one match: 10 km first, widening to 20, 50 and finally 100 km.
 * Nothing beyond 100 km is ever shown.
 */
export const RADIUS_TIERS_KM = [10, 20, 50, 100] as const;
export const MAX_RADIUS_KM = RADIUS_TIERS_KM[RADIUS_TIERS_KM.length - 1];

const KM_PER_DEGREE_LAT = 111;

/** Lat/lng box around a point — a cheap, indexed pre-filter before the exact distance calc. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lngDelta = radiusKm / (KM_PER_DEGREE_LAT * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** Prisma where-fragment for "inside the 100 km box". */
export function withinMaxBox(origin: Origin) {
  const box = boundingBox(origin.lat, origin.lng, MAX_RADIUS_KM);
  return {
    latitude: { gte: box.minLat, lte: box.maxLat },
    longitude: { gte: box.minLng, lte: box.maxLng },
  };
}

export interface Origin {
  lat: number;
  lng: number;
}

// PIN-code / city centres barely move — cache lookups for the life of the
// process (also keeps us well inside Nominatim's 1-request-per-second policy).
const originCache = new Map<string, Origin | null>();

/**
 * Where to measure distance from: the customer's own coordinates (GPS) when
 * sent, else the centre of their postal code (or city/state) via geocoding.
 * null when we can't place them at all — callers then fall back to matching
 * by postal code / city / state text.
 */
export async function resolveOrigin(q: {
  lat?: number;
  lng?: number;
  postalCode?: string;
  city?: string;
  state?: string;
}): Promise<Origin | null> {
  if (q.lat != null && q.lng != null) {
    return { lat: q.lat, lng: q.lng };
  }
  if (!q.postalCode && !q.city && !q.state) {
    return null;
  }
  const key = [q.postalCode, q.city, q.state].map((v) => (v ?? '').trim().toLowerCase()).join('|');
  if (originCache.has(key)) {
    return originCache.get(key) ?? null;
  }
  // A full 6-digit PIN is the most precise; otherwise try city/state.
  const byPin =
    q.postalCode && /^\d{6}$/.test(q.postalCode)
      ? await geoService.forwardGeocode({ postalCode: q.postalCode })
      : null;
  const point =
    byPin ??
    (q.city || q.state ? await geoService.forwardGeocode({ city: q.city, state: q.state }) : null);
  const origin = point ? { lat: point.latitude, lng: point.longitude } : null;
  originCache.set(key, origin);
  return origin;
}

/** Rounded km from the origin, or null when the place has no coordinates. */
export function distanceFrom(
  origin: Origin,
  lat: number | null,
  lng: number | null,
): number | null {
  if (lat == null || lng == null) {
    return null;
  }
  return Math.round(haversineKm(origin.lat, origin.lng, lat, lng) * 10) / 10;
}

/**
 * Keeps only the smallest ring (10 → 20 → 50 → 100 km) that has any result.
 * Items must already carry `distanceKm`; ones without coordinates are dropped.
 * radiusKm is the ring used (100 when nothing was found at all).
 */
export function pickRadiusTier<T extends { distanceKm: number | null }>(
  items: T[],
): { items: T[]; radiusKm: number } {
  const located = items.filter((i): i is T & { distanceKm: number } => i.distanceKm != null);
  for (const radius of RADIUS_TIERS_KM) {
    const inRing = located.filter((i) => i.distanceKm <= radius);
    if (inRing.length > 0) {
      return { items: inRing, radiusKm: radius };
    }
  }
  return { items: [], radiusKm: MAX_RADIUS_KM };
}

/** Shape the ranking helpers below need. */
interface Rankable {
  distanceKm: number | null;
  ratingAvg: number;
  ratingCount: number;
  createdAt: Date;
}

/**
 * Sort order inside the chosen ring:
 *  - nearest: closest first, then higher rated
 *  - reviews: most reviews, then higher rated, then closest
 *  - newest:  newest first
 *  - rating (default): higher rated, then more reviews, then closest
 */
export function compareBySort(sort: string | undefined) {
  const dist = (a: Rankable, b: Rankable) =>
    (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  return (a: Rankable, b: Rankable): number => {
    switch (sort) {
      case 'nearest':
        return dist(a, b) || b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
      case 'reviews':
        return b.ratingCount - a.ratingCount || b.ratingAvg - a.ratingAvg || dist(a, b);
      case 'newest':
        return b.createdAt.getTime() - a.createdAt.getTime();
      default:
        return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount || dist(a, b);
    }
  };
}

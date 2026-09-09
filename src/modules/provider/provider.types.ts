export interface CreateProviderInput {
  businessName: string;
  categoryId: string;
  subcategoryId?: string;
  type?: 'SERVICE' | 'STORE';
  phone: string;
  email?: string;
  description?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  depositPercent?: number;
}

export type ProviderSort = 'rating' | 'reviews' | 'newest' | 'nearest';

export interface ListProviderQuery {
  categorySlug?: string;
  subcategorySlug?: string;
  city?: string;
  // Prefix match on postal code (e.g. "3800" matches "380001").
  postalCode?: string;
  search?: string;
  type?: 'SERVICE' | 'STORE';
  // Only businesses with at least this average rating.
  minRating?: number;
  // Only businesses open right now (per their weekly hours).
  openNow?: boolean;
  // How to order the results (default: highest rated first).
  sort?: ProviderSort;
  // Customer's coordinates — required to actually sort by distance for 'nearest'.
  lat?: number;
  lng?: number;
  page: number;
  limit: number;
}

export type UpdateProviderInput = Partial<CreateProviderInput>;

export interface BusinessHourInput {
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  isOpen: boolean;
  openTime: string; // "HH:MM"
  closeTime: string;
}

export interface DateHourInput {
  date: string; // "YYYY-MM-DD"
  isOpen: boolean;
  openTime: string; // "HH:MM"
  closeTime: string;
}

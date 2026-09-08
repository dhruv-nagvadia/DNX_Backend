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

export type ProviderSort = 'rating' | 'reviews' | 'newest';

export interface ListProviderQuery {
  categorySlug?: string;
  subcategorySlug?: string;
  city?: string;
  search?: string;
  type?: 'SERVICE' | 'STORE';
  // Only businesses with at least this average rating.
  minRating?: number;
  // How to order the results (default: highest rated first).
  sort?: ProviderSort;
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

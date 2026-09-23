export interface CreateServiceInput {
  name: string;
  description?: string;
  // Price in major units (e.g. rupees); stored as minor units (paise).
  price: number;
  durationMin: number;
  currency?: string;
  // On-location services: the provider travels to the customer.
  travelRequired?: boolean;
  // Travel fees in major units (rupees); stored as minor units (paise).
  travelBaseFee?: number;
  travelPerKm?: number;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  price?: number;
  durationMin?: number;
  isActive?: boolean;
  travelRequired?: boolean;
  travelBaseFee?: number;
  travelPerKm?: number;
}

export type ServiceSort = 'rating' | 'reviews' | 'newest' | 'nearest';

export interface SearchServiceQuery {
  search?: string;
  categorySlug?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  // A service has no rating of its own — filters/sorts by the offering business's.
  minRating?: number;
  // Only services from a business that's open right now.
  openNow?: boolean;
  sort?: ServiceSort;
  lat?: number;
  lng?: number;
  page: number;
  limit: number;
}

export type Measure = 'weight' | 'volume' | 'count';

export interface CreateProductInput {
  name: string;
  description?: string;
  measure?: Measure;
  // Price in major units (rupees) for `priceQty` base units.
  price: number;
  priceQty?: number;
  // All quantities are in base units (g / ml / piece).
  stockQty?: number;
  stepQty?: number;
  section?: string;
  imageUrl?: string;
  currency?: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  measure?: Measure;
  price?: number;
  priceQty?: number;
  stockQty?: number;
  stepQty?: number;
  section?: string;
  imageUrl?: string;
  isActive?: boolean;
}

export type ProductSort = 'rating' | 'reviews' | 'newest' | 'nearest';

export interface SearchProductQuery {
  search?: string;
  // Products have no category of their own — filters by the selling store's category.
  categorySlug?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  minRating?: number;
  // Only products from a store that's open right now.
  openNow?: boolean;
  sort?: ProductSort;
  lat?: number;
  lng?: number;
  page: number;
  limit: number;
}

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
  // What kind of product this is (e.g. "Bath & Body") — lets customers
  // browse it pooled with the same kind of product from other stores.
  productTypeId?: string | null;
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
  productTypeId?: string | null;
}

export type StockAdjustmentReason = 'SALE' | 'RESTOCK' | 'DAMAGED' | 'OTHER';

export interface AdjustStockInput {
  // Positive = stock added, negative = stock removed, in the product's base unit.
  delta: number;
  reason?: StockAdjustmentReason;
  note?: string;
}

export type ProductSort = 'rating' | 'reviews' | 'newest' | 'nearest';

export interface SearchProductQuery {
  search?: string;
  // Filters by the selling store's business category (SERVICE/STORE taxonomy).
  categorySlug?: string;
  // Filters by the product's own type (e.g. "bath-body") — independent of
  // the selling store's category, pooling matching products across stores.
  productTypeSlug?: string;
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

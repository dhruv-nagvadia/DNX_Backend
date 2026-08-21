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

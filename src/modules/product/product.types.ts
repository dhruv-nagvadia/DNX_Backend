export interface CreateProductInput {
  name: string;
  description?: string;
  // Price in major units (e.g. rupees); stored as minor units (paise).
  price: number;
  unit?: string;
  section?: string;
  stockQty?: number;
  imageUrl?: string;
  currency?: string;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  unit?: string;
  section?: string;
  stockQty?: number;
  imageUrl?: string;
  isActive?: boolean;
}

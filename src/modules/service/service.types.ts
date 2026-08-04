export interface CreateServiceInput {
  name: string;
  description?: string;
  // Price in major units (e.g. rupees); stored as minor units (paise).
  price: number;
  durationMin: number;
  currency?: string;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  price?: number;
  durationMin?: number;
  isActive?: boolean;
}

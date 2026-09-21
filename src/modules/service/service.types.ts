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

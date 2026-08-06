export interface CreateProviderInput {
  businessName: string;
  categoryId: string;
  subcategoryId?: string;
  phone: string;
  email?: string;
  description?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ListProviderQuery {
  categorySlug?: string;
  subcategorySlug?: string;
  city?: string;
  search?: string;
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

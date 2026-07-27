export interface CreateProviderInput {
  businessName: string;
  categoryId: string;
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
  city?: string;
  search?: string;
  page: number;
  limit: number;
}

export type UpdateProviderInput = Partial<CreateProviderInput>;

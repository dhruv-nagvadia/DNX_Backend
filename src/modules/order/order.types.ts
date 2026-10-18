export interface OrderItemInput {
  productId: string;
  quantity: number;
}

/** A cart with items from one or more stores, paid for in a single payment. */
export interface CartCheckoutInput {
  paymentMethod: 'ONLINE' | 'PARTIAL';
  groups: Omit<CreateOrderInput, 'paymentMethod'>[];
}

export interface CreateOrderInput {
  providerId: string;
  items: OrderItemInput[];
  paymentMethod?: 'ONLINE' | 'CASH' | 'PARTIAL';
  note?: string;
  couponCode?: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  providerId: string;
  items: OrderItemInput[];
  paymentMethod?: 'ONLINE' | 'CASH';
  note?: string;
}

export interface CreateBookingInput {
  providerId: string;
  serviceId: string;
  startTime: string; // ISO datetime
  notes?: string;
  paymentMethod?: 'ONLINE' | 'CASH' | 'PARTIAL';
  couponCode?: string;
  // Required when the service is on-location (Service.travelRequired) — where
  // the provider needs to go. Snapshotted onto the booking, not a live FK, so
  // editing/deleting the saved Address later never changes a placed booking.
  serviceAddress?: {
    line: string;
    latitude?: number;
    longitude?: number;
  };
}

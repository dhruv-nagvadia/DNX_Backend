export interface CreateBookingInput {
  providerId: string;
  serviceId: string;
  startTime: string; // ISO datetime
  notes?: string;
}

export interface ReverseGeocodeQuery {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

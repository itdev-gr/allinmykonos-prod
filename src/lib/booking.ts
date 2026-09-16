export interface PricingSeason {
  start_date: string;
  end_date: string;
  price: number | string;
}

export interface PricedService {
  pricing_type: 'fixed' | 'per_hour' | 'per_day' | 'per_person';
  base_price: number | string;
  duration_minutes?: number | null;
}

/** Seasonal price for a date, falling back to the base price. */
export function unitPriceFor(service: PricedService, seasons: PricingSeason[], date: string): number {
  const season = seasons.find((s) => date >= s.start_date && date <= s.end_date);
  return Number(season ? season.price : service.base_price);
}

/** Total for one booking (single date; per_day counts as one day in MVP). */
export function computeTotal(service: PricedService, unitPrice: number, guests: number): number {
  switch (service.pricing_type) {
    case 'per_person':
      return unitPrice * guests;
    case 'per_hour':
      return service.duration_minutes ? unitPrice * (service.duration_minutes / 60) : unitPrice;
    default:
      return unitPrice;
  }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function maxBookingDateISO(daysAhead = 180): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

export const MYKONOS_AREAS = [
  'Mykonos Town (Chora)',
  'Ornos',
  'Platis Gialos',
  'Psarou',
  'Paradise',
  'Super Paradise',
  'Paraga',
  'Agios Ioannis',
  'Agios Stefanos',
  'Kalafatis',
  'Elia',
  'Ano Mera',
  'Tourlos',
  'Kanalia',
] as const;

export const CATEGORY_EMOJI: Record<string, string> = {
  transport: '🚗',
  accommodation: '🏛️',
  concierge: '🛎️',
  dining: '🍽️',
  nightlife: '🎧',
  experiences: '⛵',
  wellness: '💆',
  shopping: '🛍️',
  'local-services': '🤝',
  events: '🎉',
};

export const PRICING_LABEL: Record<string, string> = {
  fixed: '',
  per_hour: '/ hour',
  per_day: '/ day',
  per_person: '/ person',
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function formatPrice(price: number | string, currency = 'EUR'): string {
  const symbol = currency === 'EUR' ? '€' : currency + ' ';
  return `${symbol}${Number(price).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

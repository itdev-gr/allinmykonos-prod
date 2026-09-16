import { useMemo, useState } from 'react';
import {
  unitPriceFor,
  computeTotal,
  todayISO,
  maxBookingDateISO,
  type PricingSeason,
  type PricedService,
} from '../lib/booking';

interface Props {
  serviceId: string;
  pricingType: PricedService['pricing_type'];
  basePrice: number;
  currency: string;
  durationMinutes: number | null;
  minGuests: number;
  maxGuests: number | null;
  bookingMode: 'instant' | 'request';
  seasons: PricingSeason[];
  blockedDates: string[];
  loggedIn: boolean;
}

const PRICING_LABEL: Record<string, string> = {
  fixed: 'total',
  per_hour: 'per hour',
  per_day: 'per day',
  per_person: 'per person',
};

export default function BookingWidget(props: Props) {
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(props.minGuests);

  const service: PricedService = {
    pricing_type: props.pricingType,
    base_price: props.basePrice,
    duration_minutes: props.durationMinutes,
  };

  const isBlocked = date !== '' && props.blockedDates.includes(date);
  const unitPrice = useMemo(
    () => (date ? unitPriceFor(service, props.seasons, date) : props.basePrice),
    [date]
  );
  const total = computeTotal(service, unitPrice, guests);
  const symbol = props.currency === 'EUR' ? '€' : props.currency + ' ';
  const guestMax = props.maxGuests ?? 20;
  const canSubmit = date !== '' && !isBlocked;

  if (!props.loggedIn) {
    return (
      <div className="rounded-2xl bg-white border border-sand-200 p-6 text-center">
        <p className="text-sm text-navy-600 mb-4">Log in or create an account to book.</p>
        <a
          href={`/login?next=${encodeURIComponent(`/book/${props.serviceId}`)}`}
          className="inline-block w-full rounded-xl bg-navy-900 hover:bg-navy-700 text-white py-3 font-medium transition-colors"
        >
          Log in to book
        </a>
      </div>
    );
  }

  return (
    <form
      method="post"
      action="/api/bookings/create"
      className="rounded-2xl bg-white border border-sand-200 p-6 space-y-4"
    >
      <input type="hidden" name="service_id" value={props.serviceId} />

      <div>
        <label htmlFor="bk-date" className="block text-sm font-medium mb-1.5">
          Date
        </label>
        <input
          id="bk-date"
          type="date"
          name="date"
          required
          min={todayISO()}
          max={maxBookingDateISO()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-xl border border-sand-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
        {isBlocked && (
          <p className="text-sm text-red-600 mt-1.5">
            This date is not available — please pick another.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="bk-guests" className="block text-sm font-medium mb-1.5">
          Guests
        </label>
        <select
          id="bk-guests"
          name="guests"
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className="w-full rounded-xl border border-sand-200 bg-white px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-gold-400"
        >
          {Array.from({ length: guestMax - props.minGuests + 1 }, (_, i) => props.minGuests + i).map(
            (n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'guest' : 'guests'}
              </option>
            )
          )}
        </select>
      </div>

      <div>
        <label htmlFor="bk-requests" className="block text-sm font-medium mb-1.5">
          Special requests <span className="text-navy-600/60 font-normal">(optional)</span>
        </label>
        <textarea
          id="bk-requests"
          name="special_requests"
          rows={2}
          maxLength={500}
          placeholder="Allergies, celebrations, preferences…"
          className="w-full rounded-xl border border-sand-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <div className="border-t border-sand-200 pt-4 flex items-baseline justify-between">
        <span className="text-sm text-navy-600">
          {symbol}
          {unitPrice.toLocaleString()} {PRICING_LABEL[props.pricingType]}
        </span>
        <span className="font-display text-2xl">
          {symbol}
          {total.toLocaleString()}
        </span>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-xl bg-gold-500 hover:bg-gold-400 disabled:opacity-40 disabled:cursor-not-allowed text-navy-950 py-3 font-medium transition-colors"
      >
        {props.bookingMode === 'instant' ? 'Book & pay' : 'Request to book'}
      </button>
      <p className="text-xs text-center text-navy-600/70">
        {props.bookingMode === 'instant'
          ? 'Instant confirmation after payment.'
          : 'The business will confirm your request — you pay after confirmation.'}
      </p>
    </form>
  );
}

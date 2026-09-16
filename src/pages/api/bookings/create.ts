import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../../lib/supabase';
import { unitPriceFor, computeTotal, todayISO, maxBookingDateISO } from '../../../lib/booking';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');

  const form = await request.formData();
  const serviceId = form.get('service_id')?.toString() ?? '';
  const date = form.get('date')?.toString() ?? '';
  const guests = Number(form.get('guests') ?? 1);
  const specialRequests = form.get('special_requests')?.toString().trim() || null;

  const back = (msg: string) =>
    redirect(`/book/${serviceId}?error=${encodeURIComponent(msg)}`);

  if (!serviceId) return redirect('/');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayISO() || date > maxBookingDateISO()) {
    return back('Please choose a valid date.');
  }

  const { data: service } = await locals.supabase
    .from('services')
    .select(
      `id, title, base_price, currency, pricing_type, duration_minutes, min_guests, max_guests,
       booking_mode, active, business_id,
       businesses!inner(id, status, commission_pct),
       service_pricing_seasons(start_date, end_date, price)`
    )
    .eq('id', serviceId)
    .maybeSingle();

  const business = service?.businesses as any;
  if (!service || !service.active || business?.status !== 'approved') {
    return back('This service is not available for booking.');
  }
  if (!Number.isInteger(guests) || guests < service.min_guests || (service.max_guests && guests > service.max_guests)) {
    return back('Invalid number of guests.');
  }

  // Availability: blocked dates and capacity limits are checked with the
  // admin client — customers cannot see each other's bookings under RLS.
  const admin = createSupabaseAdmin();
  const { data: slots } = await admin
    .from('availability')
    .select('capacity, is_blocked')
    .eq('service_id', serviceId)
    .eq('date', date);

  if ((slots ?? []).some((s) => s.is_blocked)) {
    return back('This date is fully booked or unavailable.');
  }
  const capacity = slots?.find((s) => !s.is_blocked)?.capacity;
  if (capacity != null) {
    const { count } = await admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('service_id', serviceId)
      .eq('booking_date', date)
      .in('status', ['pending', 'confirmed']);
    if ((count ?? 0) >= capacity) {
      return back('This date is fully booked — please pick another.');
    }
  }

  // Prices and commission are always computed server-side.
  const unitPrice = unitPriceFor(service, (service.service_pricing_seasons as any[]) ?? [], date);
  const total = computeTotal(service, unitPrice, guests);

  let commissionPct = Number(business.commission_pct);
  if (!Number.isFinite(commissionPct)) {
    const { data: setting } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'default_commission_pct')
      .maybeSingle();
    commissionPct = Number(setting?.value ?? 15);
  }
  const commissionAmount = Math.round(total * commissionPct) / 100;

  const { data: booking, error } = await locals.supabase
    .from('bookings')
    .insert({
      user_id: locals.user.id,
      business_id: business.id,
      service_id: service.id,
      booking_date: date,
      guests,
      unit_price: unitPrice,
      total_price: total,
      commission_pct: commissionPct,
      commission_amount: commissionAmount,
      currency: service.currency,
      special_requests: specialRequests,
      customer_name: locals.profile?.full_name ?? locals.user.email ?? 'Guest',
      customer_email: locals.user.email ?? '',
      customer_phone: locals.profile?.phone ?? null,
    })
    .select('id')
    .single();

  if (error || !booking) {
    return back('Could not create the booking — please try again.');
  }

  if (service.booking_mode === 'instant') {
    await admin.from('payments').insert({
      booking_id: booking.id,
      amount: total,
      commission_amount: commissionAmount,
      currency: service.currency,
    });
    return redirect(`/pay/${booking.id}`);
  }

  // Request-to-book: the business confirms first; payment comes later.
  return redirect(`/bookings/${booking.id}`);
};

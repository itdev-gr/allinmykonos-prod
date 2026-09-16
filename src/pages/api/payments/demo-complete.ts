import type { APIRoute } from 'astro';
import { createSupabaseAdmin } from '../../../lib/supabase';
import { getStripe } from '../../../lib/stripe';

// Demo payment completion. Replaced by the Stripe Checkout webhook at launch —
// the success path (payment paid + booking confirmed) is identical.
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  // Once real payments are live, the demo path is disabled.
  if (getStripe()) return redirect('/account');

  const form = await request.formData();
  const bookingId = form.get('booking_id')?.toString() ?? '';

  // Load through the user's client so RLS proves the booking is theirs.
  const { data: booking } = await locals.supabase
    .from('bookings')
    .select('id, status, user_id, payments(id, status)')
    .eq('id', bookingId)
    .maybeSingle();

  if (!booking || booking.user_id !== locals.user.id) return redirect('/account');

  const payment = (booking.payments as any[])?.[0];
  if (!payment || payment.status === 'paid' || booking.status === 'cancelled') {
    return redirect(`/bookings/${bookingId}`);
  }

  const admin = createSupabaseAdmin();
  await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', payment.id);
  if (booking.status === 'pending') {
    await admin.from('bookings').update({ status: 'confirmed' }).eq('id', bookingId);
  }

  return redirect(`/bookings/${bookingId}?paid=1`);
};

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');

  const form = await request.formData();
  const bookingId = form.get('booking_id')?.toString() ?? '';
  const rating = Number(form.get('rating'));
  const comment = form.get('comment')?.toString().trim() || null;

  if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return redirect(`/bookings/${bookingId}`);
  }

  const { data: booking } = await locals.supabase
    .from('bookings')
    .select('id, business_id, user_id, status')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || booking.user_id !== locals.user.id || booking.status !== 'completed') {
    return redirect(`/bookings/${bookingId}`);
  }

  // RLS re-checks: own completed booking, one review per booking (unique).
  const { error } = await locals.supabase.from('reviews').insert({
    booking_id: bookingId,
    user_id: locals.user.id,
    business_id: booking.business_id,
    rating,
    comment,
  });

  return redirect(error ? `/bookings/${bookingId}` : `/bookings/${bookingId}?reviewed=1`);
};

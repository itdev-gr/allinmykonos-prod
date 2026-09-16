import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');

  const form = await request.formData();
  const bookingId = form.get('booking_id')?.toString() ?? '';

  // RLS limits the update to the caller's own booking; the DB trigger limits
  // customers to the cancel transition only.
  await locals.supabase
    .from('bookings')
    .update({ status: 'cancelled', cancelled_reason: 'Cancelled by customer' })
    .eq('id', bookingId);

  return redirect(`/bookings/${bookingId}`);
};

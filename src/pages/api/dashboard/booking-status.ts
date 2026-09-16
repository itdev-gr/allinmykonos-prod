import type { APIRoute } from 'astro';

const ACTION_TO_STATUS: Record<string, string> = {
  confirm: 'confirmed',
  reject: 'rejected',
  complete: 'completed',
  no_show: 'no_show',
  cancel: 'cancelled',
};

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');

  const form = await request.formData();
  const bookingId = form.get('booking_id')?.toString() ?? '';
  const status = ACTION_TO_STATUS[form.get('action')?.toString() ?? ''];

  if (bookingId && status) {
    // RLS restricts this to the owner's bookings; the DB trigger enforces
    // legal transitions (e.g. only pending -> confirmed/rejected).
    await locals.supabase.from('bookings').update({ status }).eq('id', bookingId);
  }

  return redirect('/dashboard/bookings');
};

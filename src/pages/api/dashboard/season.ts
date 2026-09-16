import type { APIRoute } from 'astro';
import { getOwnerBusiness } from '../../../lib/dashboard';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  const business = await getOwnerBusiness(locals);
  if (!business) return redirect('/dashboard');

  const form = await request.formData();
  const serviceId = form.get('service_id')?.toString() ?? '';
  const action = form.get('action')?.toString();
  const back = `/dashboard/listings/${serviceId}`;

  // Ownership check: the service must belong to this owner's business.
  const { data: service } = await locals.supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .maybeSingle();
  if (!service) return redirect('/dashboard/listings');

  if (action === 'delete') {
    await locals.supabase
      .from('service_pricing_seasons')
      .delete()
      .eq('id', form.get('season_id')?.toString() ?? '')
      .eq('service_id', serviceId);
    return redirect(back);
  }

  const start = form.get('start_date')?.toString() ?? '';
  const end = form.get('end_date')?.toString() ?? '';
  const price = Number(form.get('price'));
  if (!start || !end || end < start || !Number.isFinite(price) || price < 0) {
    return redirect(`${back}?error=${encodeURIComponent('Invalid season dates or price.')}`);
  }

  const { error } = await locals.supabase.from('service_pricing_seasons').insert({
    service_id: serviceId,
    name: form.get('name')?.toString().trim() || 'Season',
    start_date: start,
    end_date: end,
    price,
  });
  return redirect(error ? `${back}?error=${encodeURIComponent(error.message)}` : back);
};

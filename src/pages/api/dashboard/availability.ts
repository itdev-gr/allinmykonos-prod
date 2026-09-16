import type { APIRoute } from 'astro';
import { getOwnerBusiness } from '../../../lib/dashboard';

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Not authenticated' }, 401);
  const business = await getOwnerBusiness(locals);
  if (!business) return json({ error: 'No business' }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const { service_id: serviceId, date, action } = body ?? {};
  if (action !== 'toggle_block' || !serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    return json({ error: 'Invalid request' }, 400);
  }

  const { data: service } = await locals.supabase
    .from('services')
    .select('id')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .maybeSingle();
  if (!service) return json({ error: 'Service not found' }, 404);

  const { data: existing } = await locals.supabase
    .from('availability')
    .select('id, is_blocked')
    .eq('service_id', serviceId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    const { error } = await locals.supabase
      .from('availability')
      .update({ is_blocked: !existing.is_blocked })
      .eq('id', existing.id);
    if (error) return json({ error: error.message }, 500);
    return json({ blocked: !existing.is_blocked });
  }

  const { error } = await locals.supabase.from('availability').insert({
    business_id: business.id,
    service_id: serviceId,
    date,
    is_blocked: true,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ blocked: true });
};

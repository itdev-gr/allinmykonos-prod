import type { APIRoute } from 'astro';
import { getOwnerBusiness, uploadImage } from '../../../lib/dashboard';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  const business = await getOwnerBusiness(locals);
  if (!business) return redirect('/dashboard');

  const form = await request.formData();
  const serviceId = form.get('service_id')?.toString() || null;
  const backTo = serviceId ? `/dashboard/listings/${serviceId}` : '/dashboard/listings/new';

  const title = form.get('title')?.toString().trim() ?? '';
  const basePrice = Number(form.get('base_price'));
  const pricingType = form.get('pricing_type')?.toString() ?? 'fixed';
  const bookingMode = form.get('booking_mode')?.toString() === 'request' ? 'request' : 'instant';
  if (!title || !Number.isFinite(basePrice) || basePrice < 0) {
    return redirect(`${backTo}?error=${encodeURIComponent('Title and a valid price are required.')}`);
  }
  if (!['fixed', 'per_person', 'per_day', 'per_hour'].includes(pricingType)) {
    return redirect(`${backTo}?error=${encodeURIComponent('Invalid pricing type.')}`);
  }

  const minGuests = Math.max(1, Number(form.get('min_guests')) || 1);
  const maxGuestsRaw = Number(form.get('max_guests'));
  const durationRaw = Number(form.get('duration_minutes'));

  // Existing images minus removals, plus any new uploads.
  let images: string[] = [];
  if (serviceId) {
    const { data: current } = await locals.supabase
      .from('services')
      .select('images')
      .eq('id', serviceId)
      .eq('business_id', business.id)
      .maybeSingle();
    if (!current) return redirect('/dashboard/listings');
    const removals = form.getAll('remove_images').map(String);
    images = ((current.images as string[]) ?? []).filter((u) => !removals.includes(u));
  }
  for (const f of form.getAll('new_images')) {
    if (f instanceof File) {
      const url = await uploadImage(locals.user.id, f);
      if (url) images.push(url);
    }
  }

  const record = {
    business_id: business.id,
    title,
    description: form.get('description')?.toString().trim() || null,
    pricing_type: pricingType,
    base_price: basePrice,
    duration_minutes: Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null,
    min_guests: minGuests,
    max_guests: Number.isFinite(maxGuestsRaw) && maxGuestsRaw >= minGuests ? maxGuestsRaw : null,
    booking_mode: bookingMode,
    active: form.get('active') != null,
    images,
  };

  if (serviceId) {
    const { error } = await locals.supabase
      .from('services')
      .update(record)
      .eq('id', serviceId)
      .eq('business_id', business.id);
    if (error) return redirect(`${backTo}?error=${encodeURIComponent(error.message)}`);
    return redirect(`/dashboard/listings/${serviceId}`);
  }

  const { data, error } = await locals.supabase.from('services').insert(record).select('id').single();
  if (error || !data) return redirect(`${backTo}?error=${encodeURIComponent(error?.message ?? 'Failed')}`);
  return redirect(`/dashboard/listings/${data.id}`);
};

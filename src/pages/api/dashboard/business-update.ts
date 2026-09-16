import type { APIRoute } from 'astro';
import { getOwnerBusiness, uploadImage } from '../../../lib/dashboard';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  const business = await getOwnerBusiness(locals);
  if (!business) return redirect('/dashboard');

  const form = await request.formData();
  const back = '/dashboard/settings';

  const name = form.get('name')?.toString().trim() ?? '';
  const description = form.get('description')?.toString().trim() ?? '';
  const phone = form.get('phone')?.toString().trim() ?? '';
  if (!name || !description || !phone) {
    return redirect(`${back}?error=${encodeURIComponent('Name, description and phone are required.')}`);
  }

  const latRaw = Number(form.get('lat'));
  const lngRaw = Number(form.get('lng'));

  const removals = form.getAll('remove_gallery').map(String);
  const gallery = ((business.gallery as string[]) ?? []).filter((u) => !removals.includes(u));
  for (const f of form.getAll('new_gallery')) {
    if (f instanceof File) {
      const url = await uploadImage(locals.user.id, f);
      if (url) gallery.push(url);
    }
  }

  const logoUrl = await uploadImage(locals.user.id, form.get('logo') as File | null);
  const coverUrl = await uploadImage(locals.user.id, form.get('cover') as File | null);

  const { error } = await locals.supabase
    .from('businesses')
    .update({
      name,
      category_id: form.get('category_id')?.toString() || business.category_id,
      description,
      location_area: form.get('location_area')?.toString() || business.location_area,
      address: form.get('address')?.toString().trim() || null,
      lat: Number.isFinite(latRaw) && form.get('lat') ? latRaw : null,
      lng: Number.isFinite(lngRaw) && form.get('lng') ? lngRaw : null,
      phone,
      email: form.get('email')?.toString().trim() || null,
      website: form.get('website')?.toString().trim() || null,
      instagram: form.get('instagram')?.toString().trim() || null,
      gallery,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
      ...(coverUrl ? { cover_url: coverUrl } : {}),
    })
    .eq('id', business.id);

  return redirect(error ? `${back}?error=${encodeURIComponent(error.message)}` : `${back}?saved=1`);
};

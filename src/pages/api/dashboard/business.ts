import type { APIRoute } from 'astro';
import { slugify } from '../../../lib/constants';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');

  const form = await request.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  const categoryId = form.get('category_id')?.toString() ?? '';
  const area = form.get('location_area')?.toString() ?? '';
  const description = form.get('description')?.toString().trim() ?? '';
  const phone = form.get('phone')?.toString().trim() ?? '';

  if (!name || !categoryId || !area || !description || !phone) {
    return redirect(`/dashboard/setup?error=${encodeURIComponent('Please fill in all required fields.')}`);
  }

  const base = slugify(name) || 'business';
  // Suffix keeps slugs unique without a lookup round-trip.
  const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

  const { error } = await locals.supabase.from('businesses').insert({
    owner_id: locals.user.id,
    category_id: categoryId,
    name,
    slug,
    description,
    location_area: area,
    address: form.get('address')?.toString().trim() || null,
    phone,
    email: form.get('email')?.toString().trim() || null,
    website: form.get('website')?.toString().trim() || null,
    instagram: form.get('instagram')?.toString().trim() || null,
  });

  if (error) {
    return redirect(`/dashboard/setup?error=${encodeURIComponent(error.message)}`);
  }

  return redirect('/dashboard');
};

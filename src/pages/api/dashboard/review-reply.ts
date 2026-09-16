import type { APIRoute } from 'astro';
import { getOwnerBusiness } from '../../../lib/dashboard';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.user) return redirect('/login');
  const business = await getOwnerBusiness(locals);
  if (!business) return redirect('/dashboard');

  const form = await request.formData();
  const reviewId = form.get('review_id')?.toString() ?? '';
  const reply = form.get('reply')?.toString().trim() ?? '';

  if (reviewId && reply) {
    await locals.supabase
      .from('reviews')
      .update({ business_reply: reply })
      .eq('id', reviewId)
      .eq('business_id', business.id);
  }

  return redirect('/dashboard/reviews');
};

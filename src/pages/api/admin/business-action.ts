import type { APIRoute } from 'astro';

// Middleware guards /admin pages but not /api/admin/*, so the role check
// lives here too (RLS would also refuse, but fail loudly and early).
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const businessId = form.get('business_id')?.toString() ?? '';
  const action = form.get('action')?.toString() ?? '';
  if (!businessId) return redirect('/admin/businesses');

  const patch: Record<string, unknown> = {};
  switch (action) {
    case 'approve':
      patch.status = 'approved';
      break;
    case 'reject':
      patch.status = 'rejected';
      break;
    case 'suspend':
      patch.status = 'suspended';
      break;
    case 'verify':
      patch.verified = true;
      break;
    case 'unverify':
      patch.verified = false;
      break;
    case 'feature':
      patch.featured = true;
      break;
    case 'unfeature':
      patch.featured = false;
      break;
    case 'set_commission': {
      const raw = form.get('commission_pct')?.toString().trim() ?? '';
      if (raw === '') {
        patch.commission_pct = null; // back to platform default
      } else {
        const pct = Number(raw);
        if (!Number.isFinite(pct) || pct < 0 || pct > 50) return redirect('/admin/businesses');
        patch.commission_pct = pct;
      }
      break;
    }
    default:
      return redirect('/admin/businesses');
  }

  await locals.supabase.from('businesses').update(patch).eq('id', businessId);
  return redirect('/admin/businesses');
};

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (locals.profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const pct = Number(form.get('default_commission_pct'));
  if (!Number.isFinite(pct) || pct < 0 || pct > 50) return redirect('/admin/settings');

  await locals.supabase
    .from('platform_settings')
    .upsert({ key: 'default_commission_pct', value: pct, updated_at: new Date().toISOString() });

  return redirect('/admin/settings?saved=1');
};

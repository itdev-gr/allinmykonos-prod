import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = form.get('email')?.toString() ?? '';
  const password = form.get('password')?.toString() ?? '';
  const next = form.get('next')?.toString() || '';

  const { data, error } = await locals.supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error.message)}&next=${encodeURIComponent(next)}`);
  }

  if (next.startsWith('/')) return redirect(next);

  const { data: profile } = await locals.supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const home =
    profile?.role === 'admin' ? '/admin' : profile?.role === 'business' ? '/dashboard' : '/account';
  return redirect(home);
};

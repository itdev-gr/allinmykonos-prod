import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const form = await request.formData();
  const email = form.get('email')?.toString() ?? '';
  const password = form.get('password')?.toString() ?? '';
  const fullName = form.get('full_name')?.toString() ?? '';
  const phone = form.get('phone')?.toString() ?? '';
  // Only 'customer' or 'business' is honored — the DB trigger enforces this too.
  const role = form.get('role')?.toString() === 'business' ? 'business' : 'customer';
  const backTo = role === 'business' ? '/partners' : '/register';

  if (password.length < 8) {
    return redirect(`${backTo}?error=${encodeURIComponent('Password must be at least 8 characters.')}`);
  }

  const { error } = await locals.supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone, role } },
  });

  if (error) {
    return redirect(`${backTo}?error=${encodeURIComponent(error.message)}`);
  }

  return redirect(role === 'business' ? '/dashboard' : '/account');
};

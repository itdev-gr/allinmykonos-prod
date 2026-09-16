import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServer } from './lib/supabase';

const PROTECTED: Array<{ prefix: string; roles: string[] }> = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/dashboard', roles: ['business', 'admin'] },
  { prefix: '/account', roles: ['customer', 'business', 'admin'] },
  { prefix: '/bookings', roles: ['customer', 'business', 'admin'] },
  { prefix: '/pay', roles: ['customer', 'business', 'admin'] },
];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabaseServer(context.request, context.cookies);
  context.locals.supabase = supabase;
  context.locals.user = null;
  context.locals.profile = null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    context.locals.user = user;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, preferred_language')
      .eq('id', user.id)
      .single();
    context.locals.profile = profile;
  }

  const pathname = context.url.pathname;
  const rule = PROTECTED.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + '/'));

  if (rule) {
    if (!user) {
      return context.redirect(`/login?next=${encodeURIComponent(pathname)}`);
    }
    const role = context.locals.profile?.role ?? 'customer';
    if (!rule.roles.includes(role)) {
      // Send each role to its own home instead of a bare 403.
      const home = role === 'business' ? '/dashboard' : role === 'admin' ? '/admin' : '/account';
      return context.redirect(home);
    }
  }

  return next();
});

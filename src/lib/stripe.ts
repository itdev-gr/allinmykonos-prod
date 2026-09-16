import Stripe from 'stripe';

/**
 * Real payments switch on automatically once STRIPE_SECRET_KEY is set
 * (locally in .env, on Vercel in project env). Until then the app uses
 * the built-in demo checkout at /pay/[bookingId].
 */
export function getStripe(): Stripe | null {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_')) return null;
  return new Stripe(key);
}

export function getWebhookSecret(): string | null {
  const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  return secret && secret.startsWith('whsec_') ? secret : null;
}

import type { APIRoute } from 'astro';
import { getStripe, getWebhookSecret } from '../../../lib/stripe';
import { createSupabaseAdmin } from '../../../lib/supabase';

// Stripe calls this after checkout. Signature verification proves the event
// really comes from Stripe; the endpoint is inert until keys are configured.
export const POST: APIRoute = async ({ request }) => {
  const stripe = getStripe();
  const secret = getWebhookSecret();
  if (!stripe || !secret) return new Response('Stripe not configured', { status: 503 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const bookingId = session.metadata?.booking_id;
    if (bookingId) {
      const admin = createSupabaseAdmin();
      await admin
        .from('payments')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_payment_intent: (session.payment_intent as string) ?? null,
        })
        .eq('booking_id', bookingId)
        .eq('stripe_session_id', session.id);
      await admin
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId)
        .eq('status', 'pending');
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

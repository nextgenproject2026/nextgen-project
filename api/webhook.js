const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];

  // Leggi il body come buffer raw
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const rawBody = Buffer.concat(chunks);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { ticket_id, event_id } = session.metadata;

    try {
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({
          status: 'confirmed',
          stripe_payment_intent: session.payment_intent,
        })
        .eq('id', ticket_id);

      if (ticketError) throw ticketError;

      const { error: countError } = await supabase
        .rpc('increment_tickets_sold', { event_id });

      if (countError) throw countError;

      // Invia email di conferma
      try {
        const baseUrl = process.env.VERCEL_URL
          ? 'https://' + process.env.VERCEL_URL
          : 'https://www.nextgen.business';
        await fetch(`${baseUrl}/api/send-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id })
        });
      } catch (emailErr) {
        console.error('Errore invio email:', emailErr.message);
      }

      console.log(`Biglietto ${ticket_id} confermato`);

    } catch (err) {
      console.error('Errore DB:', err);
      return res.status(500).json({ error: 'Errore database' });
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    await supabase
      .from('tickets')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent', charge.payment_intent);
  }

  return res.status(200).json({ received: true });
};

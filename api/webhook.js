const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Necessario per leggere il body raw di Stripe
export const config = {
  api: { bodyParser: false }
};

const getRawBody = (req) => new Promise((resolve, reject) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => resolve(Buffer.from(data)));
  req.on('error', reject);
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

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

  // Gestisci evento pagamento completato
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { ticket_id, event_id } = session.metadata;

    try {
      // Aggiorna ticket a confermato
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({
          status: 'confirmed',
          stripe_payment_intent: session.payment_intent,
        })
        .eq('id', ticket_id);

      if (ticketError) throw ticketError;

      // Incrementa contatore biglietti venduti sull'evento
      const { error: countError } = await supabase
        .rpc('increment_tickets_sold', { event_id });

      if (countError) throw countError;

      console.log(`Biglietto ${ticket_id} confermato per evento ${event_id}`);

    } catch (err) {
      console.error('Errore aggiornamento DB:', err);
      return res.status(500).json({ error: 'Errore aggiornamento database' });
    }
  }

  // Gestisci rimborso
  if (event.type === 'charge.refunded') {
    const charge = event.data.object;
    const paymentIntent = charge.payment_intent;

    await supabase
      .from('tickets')
      .update({ status: 'refunded' })
      .eq('stripe_payment_intent', paymentIntent);
  }

  return res.status(200).json({ received: true });
};

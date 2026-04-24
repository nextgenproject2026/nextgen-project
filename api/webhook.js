const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
    // Vercel fa già il parsing del body — usiamo direttamente req.body
    event = req.body;
    if (!event || !event.type) throw new Error('Evento non valido');
  } catch (err) {
    return res.status(400).json({ error: err.message });
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

      await supabase.rpc('increment_tickets_sold', { event_id });

      // Invia email di conferma
      try {
        await fetch('https://www.nextgen.business/api/send-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id })
        });
      } catch (emailErr) {
        console.error('Errore email:', emailErr.message);
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

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  let event;
  try {
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

      // Recupera user_id dal biglietto
      const { data: ticket } = await supabase
        .from('tickets')
        .select('user_id')
        .eq('id', ticket_id)
        .single();

      // Invia email conferma account se non ancora confermato
      if (ticket?.user_id) {
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(ticket.user_id);
          if (authUser?.user && !authUser.user.email_confirmed_at) {
            await supabase.auth.admin.generateLink({
              type: 'signup',
              email: authUser.user.email,
              options: { redirectTo: 'https://www.nextgen.business/area.html' }
            });
          }
        } catch (confirmErr) {
          console.error('Errore conferma account:', confirmErr.message);
        }
      }

      // Invia email di conferma prenotazione
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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_id, ticket_type, user_id, user_email } = req.body;

  if (!event_id || !ticket_type || !user_id || !user_email) {
    return res.status(400).json({ error: 'Parametri mancanti' });
  }

  try {
    // Recupera evento da Supabase
    const { data: event, error: eventError } = await supabase
      .from('events_with_availability')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Evento non trovato' });
    }

    // Controlla disponibilità
    if (event.tickets_available <= 0) {
      return res.status(400).json({ error: 'Evento esaurito' });
    }

    // Determina prezzo
    let price;
    if (ticket_type === 'early_bird') {
      if (event.current_ticket_type !== 'early_bird') {
        return res.status(400).json({ error: 'Early bird non più disponibile' });
      }
      price = event.price_early_bird;
    } else {
      price = event.price_standard;
    }

    // Crea ticket in stato pending
    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        event_id,
        user_id,
        ticket_type,
        price_paid: price,
        status: 'pending'
      })
      .select()
      .single();

    if (ticketError) {
      return res.status(500).json({ error: 'Errore creazione biglietto' });
    }

    // Formatta data evento
    const eventDate = new Date(event.event_date).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Crea sessione Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user_email,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `${event.title} — ${ticket_type === 'early_bird' ? 'Early Bird' : 'Standard'}`,
              description: `${eventDate} · ${event.location}`,
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      metadata: {
        ticket_id: ticket.id,
        event_id,
        user_id,
        ticket_type,
      },
      success_url: `${req.headers.origin}/grazie.html?event=${encodeURIComponent(event.title)}`,
      cancel_url: `${req.headers.origin}/index.html?cancelled=true`,
    });

    // Salva session id sul ticket
    await supabase
      .from('tickets')
      .update({ stripe_session_id: session.id })
      .eq('id', ticket.id);

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: 'Errore interno del server' });
  }
};

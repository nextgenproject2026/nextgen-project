const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BREVO_API_KEY = process.env.BREVO_API_KEY;

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'NextGen Project', email: 'noreply@nextgen.business' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) throw new Error('Brevo error: ' + await res.text());
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticket_id, user_id, user_email } = req.body;
  if (!ticket_id || !user_id) return res.status(400).json({ error: 'Dati mancanti' });

  try {
    // Recupera biglietto
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*, events(title, event_date, location), profiles(full_name)')
      .eq('id', ticket_id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Biglietto non trovato' });
    if (ticket.user_id !== user_id) return res.status(403).json({ error: 'Non autorizzato' });
    if (ticket.status === 'cancelled') return res.status(400).json({ error: 'Biglietto già annullato' });

    const event = ticket.events;
    const userName = ticket.profiles?.full_name || user_email;
    const isOnline = ticket.payment_method === 'online';

    // Annulla biglietto
    const { error: updateError } = await supabase
      .from('tickets')
      .update({ status: 'cancelled' })
      .eq('id', ticket_id);

    if (updateError) throw updateError;

    // Decrementa contatore posti
    await supabase.rpc('decrement_tickets_sold', { event_id: ticket.event_id });

    const eventDate = new Date(event.event_date).toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
    });

    // Email all'utente
    await sendEmail({
      to: user_email,
      subject: `❌ Prenotazione annullata — ${event.title}`,
      html: `<body style="background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">
          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">Prenotazione annullata</p>
          <h2 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 16px;">Ciao ${userName},</h2>
          <p style="color:#a0a0a0;font-size:15px;line-height:1.7;margin:0 0 20px;">
            La tua prenotazione per <strong style="color:#fff;">${event.title}</strong> è stata annullata.
          </p>
          ${isOnline ? `<div style="background:rgba(220,50,50,0.08);border:1px solid rgba(220,50,50,0.2);border-radius:8px;padding:14px 18px;margin-bottom:20px;">
            <p style="color:#ff6b6b;font-size:14px;margin:0;">⚠️ Il pagamento online non viene rimborsato automaticamente. Contattaci se hai domande.</p>
          </div>` : ''}
          <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Evento</p>
            <p style="color:#fff;font-weight:700;margin:0 0 12px;">${event.title}</p>
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Data</p>
            <p style="color:#fff;margin:0;">${eventDate}</p>
          </div>
          <a href="https://nextgen.business/index.html#events" style="display:inline-block;background:#fff;color:#0a0a0a;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:10px 20px;border-radius:4px;text-decoration:none;">Scopri altri eventi →</a>
          <p style="color:#444;font-size:12px;margin:24px 0 0;">Speriamo di rivederti presto.</p>
        </div>
      </body>`
    });

    // Notifica admin
    await sendEmail({
      to: 'nextgen.project2026@gmail.com',
      subject: `❌ Prenotazione annullata — ${event.title}`,
      html: `<body style="background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">
          <h2 style="color:#fff;font-size:20px;font-weight:900;margin:0 0 16px;">Prenotazione annullata</h2>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 8px;">Utente: <strong style="color:#fff;">${userName}</strong> (${user_email})</p>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 8px;">Evento: <strong style="color:#fff;">${event.title}</strong></p>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 8px;">Data: <strong style="color:#fff;">${eventDate}</strong></p>
          <p style="color:#a0a0a0;font-size:14px;margin:0;">Pagamento: <strong style="color:${isOnline ? '#ff6b6b' : '#4ade80'};">${isOnline ? 'Online — valuta rimborso manuale' : 'In sede — nessun rimborso necessario'}</strong></p>
        </div>
      </body>`
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Cancel error:', err);
    return res.status(500).json({ error: err.message });
  }
};

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

  const { ticket_id, new_name, new_email, sender_id, sender_email } = req.body;
  if (!ticket_id || !new_name || !new_email) return res.status(400).json({ error: 'Dati mancanti' });

  try {
    // Recupera biglietto con evento
    const { data: ticket } = await supabase
      .from('tickets')
      .select('*, events(title, event_date, location), profiles(full_name, email)')
      .eq('id', ticket_id)
      .single();

    if (!ticket) return res.status(404).json({ error: 'Biglietto non trovato' });
    if (ticket.user_id !== sender_id) return res.status(403).json({ error: 'Non autorizzato' });
    if (ticket.status === 'cancelled') return res.status(400).json({ error: 'Biglietto già annullato' });

    const event = ticket.events;
    const senderName = ticket.profiles?.full_name || sender_email;

    // Cerca o crea account per il nuovo partecipante
    let newUserId = null;
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', new_email)
      .single();

    if (existingProfile) {
      newUserId = existingProfile.id;
    } else {
      // Crea utente placeholder — verrà completato al primo login
      const { data: newUser } = await supabase.auth.admin.createUser({
        email: new_email,
        user_metadata: { full_name: new_name },
        email_confirm: true
      });
      newUserId = newUser?.user?.id;
    }

    if (!newUserId) return res.status(500).json({ error: 'Impossibile creare utente' });

    // Trasferisci biglietto
    const { error: updateError } = await supabase
      .from('tickets')
      .update({ user_id: newUserId })
      .eq('id', ticket_id);

    if (updateError) throw updateError;

    const eventDate = new Date(event.event_date).toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome'
    });
    const ticketCode = ticket.qr_code?.slice(0, 8).toUpperCase();

    // Email al cedente
    await sendEmail({
      to: sender_email,
      subject: `✅ Biglietto ceduto — ${event.title}`,
      html: `<body style="background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">
          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">Cessione biglietto</p>
          <h2 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 16px;">Biglietto ceduto con successo</h2>
          <p style="color:#a0a0a0;font-size:15px;line-height:1.7;margin:0 0 20px;">
            Hai ceduto il tuo biglietto per <strong style="color:#fff;">${event.title}</strong> a <strong style="color:#fff;">${new_name}</strong> (${new_email}).
          </p>
          <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;">
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Evento</p>
            <p style="color:#fff;font-weight:700;margin:0 0 12px;">${event.title}</p>
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Data</p>
            <p style="color:#fff;margin:0;">${eventDate}</p>
          </div>
          <p style="color:#444;font-size:12px;margin:24px 0 0;">Il biglietto è ora intestato a ${new_name}.</p>
        </div>
      </body>`
    });

    // Email al nuovo partecipante
    await sendEmail({
      to: new_email,
      subject: `🎟️ Hai ricevuto un biglietto — ${event.title}`,
      html: `<body style="background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">
          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">NextGen Project</p>
          <h2 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 8px;">Ciao ${new_name}!</h2>
          <p style="color:#a0a0a0;font-size:15px;line-height:1.7;margin:0 0 20px;">
            <strong style="color:#fff;">${senderName}</strong> ti ha ceduto il suo biglietto per <strong style="color:#fff;">${event.title}</strong>. Il tuo posto è confermato!
          </p>
          <div style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Evento</p>
            <p style="color:#fff;font-weight:700;margin:0 0 12px;">${event.title}</p>
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Data</p>
            <p style="color:#fff;margin:0 0 12px;">${eventDate}</p>
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Location</p>
            <p style="color:#fff;margin:0 0 12px;">${event.location || '—'}</p>
            <p style="color:#444;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Codice biglietto</p>
            <p style="color:#fff;font-family:monospace;margin:0;">#${ticketCode}</p>
          </div>
          <a href="https://nextgen.business/area.html" style="display:inline-block;background:#fff;color:#0a0a0a;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:10px 20px;border-radius:4px;text-decoration:none;">Accedi alla tua area →</a>
          <p style="color:#444;font-size:12px;margin:24px 0 0;">Ci vediamo all'evento!</p>
        </div>
      </body>`
    });

    // Notifica admin
    await sendEmail({
      to: 'nextgen.project2026@gmail.com',
      subject: `🔄 Cessione biglietto — ${event.title}`,
      html: `<body style="background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;padding:40px 20px;">
        <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">
          <h2 style="color:#fff;font-size:20px;font-weight:900;margin:0 0 16px;">Cessione biglietto</h2>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 16px;">Evento: <strong style="color:#fff;">${event.title}</strong></p>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 8px;">Da: <strong style="color:#fff;">${senderName}</strong> (${sender_email})</p>
          <p style="color:#a0a0a0;font-size:14px;margin:0;">A: <strong style="color:#fff;">${new_name}</strong> (${new_email})</p>
        </div>
      </body>`
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Transfer error:', err);
    return res.status(500).json({ error: err.message });
  }
};

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BREVO_API_KEY = process.env.BREVO_API_KEY;

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'NextGen Project', email: 'noreply@nextgen.business' },
      to: [{ email: to }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Brevo error: ' + err);
  }
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { ticket_id } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id mancante' });

  try {
    // Recupera biglietto con evento e profilo
    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('*, events(title, event_date, location, price_standard, price_early_bird, price_onsite), profiles(full_name, email)')
      .eq('id', ticket_id)
      .single();

    if (error || !ticket) return res.status(404).json({ error: 'Biglietto non trovato' });

    const event = ticket.events;
    const profile = ticket.profiles;
    const name = profile?.full_name || 'Partecipante';
    const email = profile?.email;
    if (!email) return res.status(400).json({ error: 'Email utente non trovata' });

    const eventDate = new Date(event.event_date).toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const price = (ticket.price_paid / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    const isOnline = ticket.payment_method === 'online';
    const ticketCode = ticket.qr_code?.slice(0, 8).toUpperCase();

    const subject = isOnline
      ? `✅ Pagamento confermato — ${event.title}`
      : `🎟️ Posto riservato — ${event.title}`;

    const paymentBlock = isOnline
      ? `<div style="background:#0a3d1f;border:1px solid #1a6b35;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="color:#4ade80;font-weight:700;margin:0 0 4px;">✅ Pagamento confermato</p>
           <p style="color:#a7f3c5;font-size:14px;margin:0;">Importo pagato: <strong>${price}</strong></p>
         </div>`
      : `<div style="background:#3d2a00;border:1px solid #6b4a00;border-radius:8px;padding:16px 20px;margin:20px 0;">
           <p style="color:#fbbf24;font-weight:700;margin:0 0 4px;">💵 Pagamento in sede</p>
           <p style="color:#fde68a;font-size:14px;margin:0;">Ricorda di portare <strong>€25 in contanti</strong> all'ingresso.</p>
         </div>`;

    const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        
        <!-- LOGO -->
        <tr><td style="padding-bottom:40px;">
          <img src="https://nextgen.business/logo-white.png" alt="NextGen" height="28" style="display:block;">
        </td></tr>

        <!-- HEADER -->
        <tr><td style="background:#111111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:40px;">
          
          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">Prenotazione confermata</p>
          <h1 style="color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.02em;margin:0 0 8px;">Ciao ${name},</h1>
          <p style="color:#a0a0a0;font-size:16px;line-height:1.7;margin:0 0 24px;">
            ${isOnline
              ? 'Il tuo pagamento è andato a buon fine. Il tuo posto è confermato.'
              : 'Il tuo posto è riservato. Ci vediamo all\'evento — ricorda di portare il contante!'}
          </p>

          ${paymentBlock}

          <!-- DETTAGLI EVENTO -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;padding:20px;margin:20px 0;">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Evento</span>
                <p style="color:#ffffff;font-size:16px;font-weight:700;margin:4px 0 0;">${event.title}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Data e ora</span>
                <p style="color:#ffffff;font-size:15px;margin:4px 0 0;">${eventDate}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Location</span>
                <p style="color:#ffffff;font-size:15px;margin:4px 0 0;">${event.location || '—'}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;">
                <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Codice biglietto</span>
                <p style="color:#ffffff;font-size:15px;font-family:monospace;margin:4px 0 0;">#${ticketCode}</p>
              </td>
            </tr>
          </table>

          <!-- COMMUNITY CTA -->
          <div style="background:#0d1a2e;border:1px solid #1a3a5c;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="color:#60a5fa;font-weight:700;margin:0 0 8px;">👥 Scopri chi partecipa</p>
            <p style="color:#93c5fd;font-size:14px;line-height:1.6;margin:0 0 16px;">
              Accedi alla tua area personale per esplorare i profili degli altri partecipanti e connetterti prima dell'evento.
            </p>
            <a href="https://nextgen.business/area.html" style="display:inline-block;background:#ffffff;color:#0a0a0a;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:12px 24px;border-radius:4px;text-decoration:none;">Vai alla tua area →</a>
          </div>

          <p style="color:#444;font-size:13px;line-height:1.6;margin:24px 0 0;">
            Non vediamo l'ora di incontrarti. Se hai domande, rispondi a questa email o scrivici su Instagram <a href="https://instagram.com/nextgenproject_" style="color:#a0a0a0;">@nextgenproject_</a>
          </p>

        </td></tr>

        <!-- FOOTER -->
        <tr><td style="padding:24px 0;text-align:center;">
          <p style="color:#444;font-size:12px;margin:0;">
            © 2026 NextGen Project · <a href="https://nextgen.business" style="color:#444;text-decoration:none;">nextgen.business</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmail({ to: email, subject, html });
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Send confirmation error:', err);
    return res.status(500).json({ error: err.message });
  }
};

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
  if (!res.ok) throw new Error('Brevo error: ' + await res.text());
  return res.json();
}

module.exports = async (req, res) => {
  // Sicurezza: verifica il cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Non autorizzato' });
  }

  try {
    // Trova eventi che iniziano tra 20 e 28 ore da ora
    const now = new Date();
    const from = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    const { data: events } = await supabase
      .from('events')
      .select('*')
      .gte('event_date', from.toISOString())
      .lte('event_date', to.toISOString())
      .eq('is_published', true);

    if (!events?.length) {
      return res.status(200).json({ message: 'Nessun evento domani', sent: 0 });
    }

    let totalSent = 0;

    for (const event of events) {
      // Recupera tutti i biglietti confermati per questo evento
      const { data: tickets } = await supabase
        .from('tickets')
        .select('*, profiles(full_name, email)')
        .eq('event_id', event.id)
        .eq('status', 'confirmed');

      if (!tickets?.length) continue;

      const eventDate = new Date(event.event_date).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      for (const ticket of tickets) {
        const email = ticket.profiles?.email;
        const name = ticket.profiles?.full_name || 'Partecipante';
        if (!email) continue;

        const isOnsite = ticket.payment_method === 'onsite';
        const ticketCode = ticket.qr_code?.slice(0, 8).toUpperCase();

        const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <tr><td style="padding-bottom:40px;">
          <div style="margin-bottom:32px;"><span style="font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:-0.03em;color:#ffffff;">NEXTGEN</span></div>
        </td></tr>

        <tr><td style="background:#111111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:40px;">

          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">Reminder — domani ci vediamo</p>
          <h1 style="color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.02em;margin:0 0 8px;">Ci siamo, ${name}!</h1>
          <p style="color:#a0a0a0;font-size:16px;line-height:1.7;margin:0 0 24px;">
            Manca meno di 24 ore a <strong style="color:#ffffff;">${event.title}</strong>. Non vediamo l'ora di incontrarti.
          </p>

          ${isOnsite ? `<div style="background:#3d2a00;border:1px solid #6b4a00;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="color:#fbbf24;font-weight:700;margin:0 0 8px;">💵 Pagamento in sede — €25</p>
            <p style="color:#fde68a;font-size:14px;margin:0 0 10px;">Domani potrai pagare in due modi:</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(251,191,36,0.2);border-radius:6px;padding:10px 14px;flex:1;min-width:120px;">
                <p style="color:#fbbf24;font-size:13px;font-weight:700;margin:0 0 2px;">💵 Contanti</p>
                <p style="color:#fde68a;font-size:12px;margin:0;">Porta €25 in contanti</p>
              </div>
              <div style="background:rgba(0,0,0,0.2);border:1px solid rgba(251,191,36,0.2);border-radius:6px;padding:10px 14px;flex:1;min-width:120px;">
                <p style="color:#fbbf24;font-size:13px;font-weight:700;margin:0 0 2px;">🅿️ PayPal</p>
                <p style="color:#fde68a;font-size:12px;margin:0;">Pagamento PayPal disponibile</p>
              </div>
            </div>
          </div>` : ''}

          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;padding:20px;margin:20px 0;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Evento</span>
              <p style="color:#ffffff;font-size:16px;font-weight:700;margin:4px 0 0;">${event.title}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Quando</span>
              <p style="color:#ffffff;font-size:15px;margin:4px 0 0;">${eventDate}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Dove</span>
              <p style="color:#ffffff;font-size:15px;margin:4px 0 0;">${event.location || '—'}</p>
            </td></tr>
            <tr><td style="padding:8px 0;">
              <span style="color:#444;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Il tuo codice</span>
              <p style="color:#ffffff;font-size:15px;font-family:monospace;margin:4px 0 0;">#${ticketCode}</p>
            </td></tr>
          </table>

          <div style="background:#0d1a2e;border:1px solid #1a3a5c;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="color:#60a5fa;font-weight:700;margin:0 0 8px;">👥 Chi partecipa con te</p>
            <p style="color:#93c5fd;font-size:14px;line-height:1.6;margin:0 0 16px;">
              Scopri i profili degli altri partecipanti e connettiti prima di arrivare.
            </p>
            <a href="https://nextgen.business/area.html" style="display:inline-block;background:#ffffff;color:#0a0a0a;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:12px 24px;border-radius:4px;text-decoration:none;">Esplora la community →</a>
          </div>

          <p style="color:#444;font-size:13px;line-height:1.6;margin:24px 0 0;">
            Ci vediamo domani sera. 🙌<br>
            — Il team NextGen
          </p>

        </td></tr>

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

        try {
          await sendEmail({
            to: email,
            subject: `⏰ Domani ci vediamo — ${event.title}`,
            html
          });
          totalSent++;
        } catch (err) {
          console.error(`Errore invio reminder a ${email}:`, err.message);
        }
      }
    }

    return res.status(200).json({ success: true, sent: totalSent, events: events.length });

  } catch (err) {
    console.error('Cron reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
};

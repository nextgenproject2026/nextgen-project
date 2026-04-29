const BREVO_API_KEY = process.env.BREVO_API_KEY;
const ADMIN_EMAIL = 'nextgen.project2026@gmail.com';

async function sendEmail({ subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'NextGen Platform', email: 'noreply@nextgen.business' },
      to: [{ email: ADMIN_EMAIL }],
      subject,
      htmlContent: html
    })
  });
  if (!res.ok) throw new Error('Brevo error: ' + await res.text());
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, user_name, user_email, event_title, registered_at } = req.body;
  if (!type || !user_email) return res.status(400).json({ error: 'Dati mancanti' });

  const date = new Date(registered_at || Date.now()).toLocaleString('it-IT', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const isCommunityOnly = type === 'community';

  const badgeColor = isCommunityOnly ? '#1a3a5c' : '#0a3d1f';
  const badgeBorder = isCommunityOnly ? '#1a5c8a' : '#1a6b35';
  const badgeTextColor = isCommunityOnly ? '#60a5fa' : '#4ade80';
  const badgeLabel = isCommunityOnly
    ? '👤 Nuova iscrizione community'
    : '🎟️ Nuova iscrizione community + evento';

  const eventBlock = !isCommunityOnly ? `
    <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
      <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Evento prenotato</span>
      <p style="color:#4ade80;font-size:15px;font-weight:700;margin:4px 0 0;">${event_title}</p>
    </td></tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr><td style="background:#111111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">

          <!-- BADGE -->
          <div style="background:${badgeColor};border:1px solid ${badgeBorder};border-radius:6px;padding:10px 16px;margin-bottom:24px;display:inline-block;">
            <span style="color:${badgeTextColor};font-size:13px;font-weight:700;">${badgeLabel}</span>
          </div>

          <h2 style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.02em;margin:0 0 6px;">
            ${isCommunityOnly ? 'Nuovo membro nella community' : 'Nuova prenotazione evento'}
          </h2>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 24px;">${date}</p>

          <!-- DETTAGLI UTENTE -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;padding:16px 20px;">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Nome</span>
              <p style="color:#ffffff;font-size:15px;font-weight:700;margin:4px 0 0;">${user_name || '—'}</p>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Email</span>
              <p style="color:#ffffff;font-size:15px;margin:4px 0 0;">${user_email}</p>
            </td></tr>
            ${eventBlock}
            <tr><td style="padding:8px 0;">
              <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Tipo iscrizione</span>
              <p style="color:${badgeTextColor};font-size:14px;font-weight:700;margin:4px 0 0;">
                ${isCommunityOnly ? 'Solo community' : 'Community + evento'}
              </p>
            </td></tr>
          </table>

          <div style="margin-top:20px;">
            <a href="https://nextgen.business/area.html" style="display:inline-block;background:#ffffff;color:#0a0a0a;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:10px 20px;border-radius:4px;text-decoration:none;">Vai all'area admin →</a>
          </div>

        </td></tr>

        <tr><td style="padding:20px 0;text-align:center;">
          <p style="color:#444;font-size:12px;margin:0;">NextGen Platform · Notifica automatica</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await sendEmail({
      subject: isCommunityOnly
        ? `👤 Nuovo membro: ${user_name || user_email}`
        : `🎟️ Nuova prenotazione: ${user_name || user_email} — ${event_title}`,
      html
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Notify admin error:', err);
    return res.status(500).json({ error: err.message });
  }
};


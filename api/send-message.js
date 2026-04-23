const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BREVO_API_KEY = process.env.BREVO_API_KEY;

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { recipient_id, sender_name, sender_email, message } = req.body;
  if (!recipient_id || !sender_name || !sender_email || !message) {
    return res.status(400).json({ error: 'Dati mancanti' });
  }

  try {
    // Recupera email del destinatario
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', recipient_id)
      .single();

    if (!profile?.email) return res.status(404).json({ error: 'Destinatario non trovato' });

    const recipientName = profile.full_name?.split(' ')[0] || 'Ciao';

    const html = `<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <tr><td style="background:#111111;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:32px;">

          <p style="color:#a0a0a0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;margin:0 0 16px;">NextGen Community</p>
          <h2 style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.02em;margin:0 0 6px;">
            Hai ricevuto un messaggio, ${recipientName}
          </h2>
          <p style="color:#a0a0a0;font-size:14px;margin:0 0 24px;">
            <strong style="color:#ffffff;">${sender_name}</strong> ti ha scritto dalla community NextGen.
          </p>

          <!-- MESSAGGIO -->
          <div style="background:#1a1a1a;border-left:3px solid rgba(255,255,255,0.2);border-radius:0 4px 4px 0;padding:16px 20px;margin-bottom:24px;">
            <p style="color:#e8e8e8;font-size:15px;line-height:1.7;margin:0;">${message.replace(/\n/g, '<br>')}</p>
          </div>

          <!-- MITTENTE -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
            <tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Da</span>
              <p style="color:#ffffff;font-size:14px;font-weight:700;margin:4px 0 0;">${sender_name}</p>
            </td></tr>
            <tr><td style="padding:6px 0;">
              <span style="color:#444;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Email di risposta</span>
              <p style="margin:4px 0 0;"><a href="mailto:${sender_email}" style="color:#60a5fa;font-size:14px;text-decoration:none;">${sender_email}</a></p>
            </td></tr>
          </table>

          <a href="mailto:${sender_email}" style="display:inline-block;background:#ffffff;color:#0a0a0a;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;padding:10px 20px;border-radius:4px;text-decoration:none;">Rispondi via email →</a>

          <p style="color:#444;font-size:12px;line-height:1.6;margin:24px 0 0;">
            Hai ricevuto questo messaggio perché il tuo profilo è visibile nella community NextGen.
          </p>

        </td></tr>

        <tr><td style="padding:20px 0;text-align:center;">
          <p style="color:#444;font-size:12px;margin:0;">NextGen Project · <a href="https://nextgen.business" style="color:#444;text-decoration:none;">nextgen.business</a></p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: `${sender_name} via NextGen`, email: 'noreply@nextgen.business' },
        to: [{ email: profile.email, name: profile.full_name }],
        replyTo: { email: sender_email, name: sender_name },
        subject: `💬 Nuovo messaggio da ${sender_name}`,
        htmlContent: html
      })
    });

    if (!emailRes.ok) throw new Error('Brevo error: ' + await emailRes.text());

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: err.message });
  }
};

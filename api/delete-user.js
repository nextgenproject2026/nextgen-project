const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id, admin_token } = req.body;

  if (!user_id) return res.status(400).json({ error: 'user_id mancante' });

  // Verifica che il chiamante sia admin controllando il token
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(admin_token);
  if (authError || !user) return res.status(401).json({ error: 'Non autorizzato' });

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) return res.status(403).json({ error: 'Non sei admin' });

  // Non permettere di cancellare se stessi
  if (user_id === user.id) return res.status(400).json({ error: 'Non puoi cancellare il tuo account' });

  // Cancella utente da auth (cascade cancella anche il profilo)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
};

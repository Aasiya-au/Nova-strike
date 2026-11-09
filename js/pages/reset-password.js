import { renderHeader } from '../components.js';
import { supabase } from '../supabaseClient.js';
import { getSession, updatePassword, friendlyError } from '../auth.js';
import { showMessage, clearMessage, setBusy, setFieldError, validatePassword } from '../ui.js';

// Read link errors (expired / already used) before Supabase clears the URL hash.
const linkError = new URLSearchParams(location.hash.slice(1)).get('error_description');
renderHeader();
const form = document.getElementById('reset-form'), msg = document.getElementById('form-message'), btn = document.getElementById('submit-btn');
const pw = document.getElementById('password'), confirm = document.getElementById('confirm');
const showForm = () => { form.classList.remove('hidden'); document.getElementById('request-new').hidden = true; clearMessage(msg); pw.focus(); };

supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showForm(); });
if (await getSession()) showForm();   // the reset link signs the player into a recovery session
else {
  showMessage(msg, 'error', linkError ? 'This reset link has expired or was already used.' : 'Open the reset link from your email to choose a new password.');
  document.getElementById('request-new').hidden = false;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault(); clearMessage(msg);
  const okPw = setFieldError(pw, validatePassword(pw.value));
  const okConfirm = setFieldError(confirm, pw.value === confirm.value ? '' : 'Passwords do not match.');
  if (!okPw || !okConfirm) return (okPw ? confirm : pw).focus();
  setBusy(btn, true, 'Saving…');
  try { await updatePassword(pw.value); showMessage(msg, 'success', 'Password updated. Taking you to your dashboard…'); setTimeout(() => { location.href = 'dashboard.html'; }, 1500); }
  catch (err) { showMessage(msg, 'error', friendlyError(err)); setBusy(btn, false); }
});

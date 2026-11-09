import { renderHeader } from '../components.js';
import { sendPasswordReset, friendlyError } from '../auth.js';
import { isConfigured } from '../supabaseClient.js';
import { showMessage, clearMessage, setBusy, setFieldError, validateEmail } from '../ui.js';

renderHeader();
const form = document.getElementById('forgot-form'), msg = document.getElementById('form-message'), email = document.getElementById('email'), btn = document.getElementById('submit-btn');
if (!isConfigured) showMessage(msg, 'warn', 'Supabase is not configured yet. Add your project URL and key in js/config.js.');

form.addEventListener('submit', async (e) => {
  e.preventDefault(); clearMessage(msg);
  if (!setFieldError(email, validateEmail(email.value.trim()))) return email.focus();
  setBusy(btn, true, 'Sending…');
  try {   // the same message is shown whether or not the address has an account, so it cannot be used to find accounts
    await sendPasswordReset(email.value.trim());
    showMessage(msg, 'success', 'If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.');
  } catch (err) { showMessage(msg, 'error', friendlyError(err)); }
  setBusy(btn, false);
});

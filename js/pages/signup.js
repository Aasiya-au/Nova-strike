import { renderHeader } from '../components.js';
import { redirectIfAuthed, signUp, friendlyError } from '../auth.js';
import { isConfigured } from '../supabaseClient.js';
import { showMessage, clearMessage, setBusy, setFieldError, validateEmail, validatePassword, validateDisplayName } from '../ui.js';

await redirectIfAuthed();
renderHeader();
const form = document.getElementById('signup-form'), msg = document.getElementById('form-message');
const name = document.getElementById('display-name'), email = document.getElementById('email'), password = document.getElementById('password'), btn = document.getElementById('submit-btn');
if (!isConfigured) showMessage(msg, 'warn', 'Supabase is not configured yet. Add your project URL and anon key in js/config.js.');

form.addEventListener('submit', async (e) => {
  e.preventDefault(); clearMessage(msg);
  const checks = [[name, validateDisplayName(name.value)], [email, validateEmail(email.value.trim())], [password, validatePassword(password.value)]];
  const bad = checks.filter(([i, m]) => !setFieldError(i, m));
  if (bad.length) return bad[0][0].focus();
  setBusy(btn, true, 'Creating account…');
  try {
    const data = await signUp(name.value, email.value.trim(), password.value);
    if (data.session) location.href = 'dashboard.html';
    else { showMessage(msg, 'success', 'Account created. Check your email to confirm it, then log in.'); form.reset(); setBusy(btn, false); }
  } catch (err) { showMessage(msg, 'error', friendlyError(err)); setBusy(btn, false); }
});

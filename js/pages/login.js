import { renderHeader } from '../components.js';
import { redirectIfAuthed, signIn, friendlyError, nextUrl, resendConfirmation } from '../auth.js';
import { isConfigured } from '../supabaseClient.js';
import { showMessage, clearMessage, setBusy, setFieldError, validateEmail, button } from '../ui.js';

await redirectIfAuthed();
renderHeader();
const form = document.getElementById('login-form'), msg = document.getElementById('form-message');
const email = document.getElementById('email'), password = document.getElementById('password'), btn = document.getElementById('submit-btn');
if (!isConfigured) showMessage(msg, 'warn', 'Supabase is not configured yet. Add your project URL and key in js/config.js.');

form.addEventListener('submit', async (e) => {
  e.preventDefault(); clearMessage(msg);
  const okEmail = setFieldError(email, validateEmail(email.value.trim()));
  const okPass = setFieldError(password, password.value ? '' : 'Enter your password.');
  if (!okEmail || !okPass) return (okEmail ? password : email).focus();
  setBusy(btn, true, 'Logging in…');
  try { await signIn(email.value.trim(), password.value); location.href = nextUrl(); }
  catch (err) {
    showMessage(msg, 'error', friendlyError(err)); setBusy(btn, false);
    if (/not confirmed/i.test(err.message)) {   // unverified email: offer to send the link again
      msg.firstChild.append(' ', button('Resend confirmation email', { variant: 'ghost', onClick: async (ev) => {
        ev.target.disabled = true;
        try { await resendConfirmation(email.value.trim()); showMessage(msg, 'success', 'Confirmation email sent. Check your inbox and spam folder.'); }
        catch (e2) { showMessage(msg, 'error', friendlyError(e2)); }
      } }));
    }
  }
});

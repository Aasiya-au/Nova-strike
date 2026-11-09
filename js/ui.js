// Small reusable UI helpers. All user text goes through textContent / text nodes (never innerHTML).
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}

export const button = (label, { variant = 'primary', onClick, type = 'button', id } = {}) =>
  el('button', { class: `btn btn-${variant}`, type, id, onclick: onClick }, label);

export const linkButton = (label, href, variant = 'primary') => el('a', { class: `btn btn-${variant}`, href }, label);

export function showMessage(container, type, text) {
  container.replaceChildren(el('div', { class: `msg msg-${type}`, role: type === 'error' ? 'alert' : 'status' }, text));
}
export const clearMessage = (container) => container.replaceChildren();

export function setBusy(btn, busy, busyLabel = 'Please wait…') {
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = busyLabel; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  btn.disabled = busy;
}

export function setFieldError(input, msg) {
  const out = document.getElementById(`${input.id}-error`);
  if (out) out.textContent = msg || '';
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  return !msg;
}

// Validators return an error string, or '' when valid. Length counts Unicode characters, not bytes.
const len = (s) => [...s].length;
export const validateEmail = (v) => !v ? 'Enter your email address.' : (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254 ? '' : 'Enter a valid email address, like pilot@example.com.');
export const validatePassword = (v) => !v ? 'Enter a password.' : (v.length < 8 ? 'Use at least 8 characters.' : (v.length > 72 ? 'Use 72 characters or fewer.' : ''));
export const validateDisplayName = (v) => { const n = v.trim(); return !n ? 'Enter a display name.' : (len(n) > 40 ? 'Use 40 characters or fewer.' : (/\p{C}/u.test(n) ? 'Remove control characters.' : '')); };

export const fmtNum = (n) => Number(n || 0).toLocaleString();
export const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export const fmtTime = (s) => { s = Math.round(s || 0); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

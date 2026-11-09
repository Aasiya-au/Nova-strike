import { supabase } from './supabaseClient.js';

const NEXT_ALLOWED = /^(dashboard|profile|game)\.html(\?level=\d{1,2})?$/;
const never = () => new Promise(() => {});
let watching = false, signingOut = false;

export async function getSession() {
  const { data } = await supabase.auth.getSession();   // waits for Supabase to read any session from a confirm/reset link first
  return data.session;
}

/** Protected pages call this first. Redirects to login if signed out (never resolves then, so the page stops). */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    const here = location.pathname.split('/').pop() + location.search;
    location.replace(`login.html?next=${encodeURIComponent(here)}`);
    return never();
  }
  if (!watching) {   // if the session ends (other tab logs out, token revoked), leave the protected page
    watching = true;
    supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && !signingOut) location.replace('login.html'); });
  }
  return session;
}

export async function redirectIfAuthed() {
  if (await getSession()) { location.replace('dashboard.html'); return never(); }
}

export function nextUrl() {
  const n = new URLSearchParams(location.search).get('next');
  return n && NEXT_ALLOWED.test(n) ? n : 'dashboard.html';
}

const RULES = [
  [/invalid login credentials/i, 'Email or password is incorrect. Check both and try again.'],
  [/already registered|already been registered/i, 'An account with this email already exists. Log in instead, or reset your password.'],
  [/email not confirmed/i, 'Confirm your email first: open the link we sent you, then log in.'],
  [/rate limit|too many|security purposes/i, 'Too many attempts. Wait a few minutes and try again.'],
  [/password.*(short|least|weak|characters)|weak password/i, 'Choose a stronger password (at least 8 characters).'],
  [/same password|different from the old/i, 'Choose a password you have not used before.'],
  [/invalid api key|apikey|jwt/i, 'The app is not configured correctly (check the key in js/config.js).'],
  [/fetch|network/i, 'Could not reach the server. Check your connection.'],
];
export const friendlyError = (e) => RULES.find(([re]) => re.test(e?.message || ''))?.[1] || 'Something went wrong. Try again.';

const pageUrl = (name) => new URL(name, location.href).href;   // works on localhost and on Netlify

export async function signUp(displayName, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { display_name: displayName.trim() }, emailRedirectTo: pageUrl('dashboard.html') },
  });
  if (error) throw error;
  // With email confirmation ON, Supabase hides duplicates by returning a user with no identities instead of an error.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('User already registered');
  return data;
}
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() { signingOut = true; await supabase.auth.signOut(); }

export async function resendConfirmation(email) {
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: pageUrl('dashboard.html') } });
  if (error) throw error;
}
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: pageUrl('reset-password.html') });
  if (error) throw error;
}
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

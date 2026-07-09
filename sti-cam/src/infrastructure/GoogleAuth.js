/**
 * Infraestructura: autenticación con Firebase Auth (proveedor Google).
 *
 * El login usa el proyecto Firebase de Sti-platform (signInWithPopup +
 * GoogleAuthProvider). El access token OAuth de Google necesario para
 * llamar a Drive/Sheets se extrae del credential que Firebase devuelve
 * en el momento del sign-in — Firebase no lo renueva automáticamente
 * (a diferencia de su propio ID token), así que este módulo sigue
 * manejando expiración y renovación igual que antes.
 *
 * Token y user info persisten en localStorage.
 *
 * v4: Migrado de Google Identity Services (GIS) token model a Firebase Auth.
 *     Mantiene la misma superficie exportada — initAuth, requestAccessToken,
 *     getAccessToken, getSavedUser, hasValidToken, clearToken, revokeToken,
 *     silentRenewalFailed, el evento 'sti-cam:auth-required' — para no tocar
 *     a los consumidores (useAuth, GoogleDrive, GoogleSheets, App).
 */

import { signInWithPopup, onAuthStateChanged, signOut as fbSignOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase.js';
import { GOOGLE_SCOPES } from '../config/google.js';
import { logger } from './Logger.js';

const STORAGE_KEY = 'sti-cam-auth';
const SCHEMA_VERSION = 2;

let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Module-level flag — set to true when background renewal is blocked in PWA mode.
 * Callers (like syncOfflineQueue) can check this to know they need to show a
 * manual re-auth UI.
 */
export let silentRenewalFailed = false;

// Restore from localStorage on load. schemaVersion guards against stale
// sessions from the pre-Firebase (GIS) auth model.
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (
    saved &&
    saved.schemaVersion === SCHEMA_VERSION &&
    saved.token &&
    saved.expiresAt > Date.now() &&
    saved.grantedScopes === GOOGLE_SCOPES
  ) {
    accessToken = saved.token;
    tokenExpiresAt = saved.expiresAt;
  }
} catch {}

function persistSession(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    token: accessToken,
    expiresAt: tokenExpiresAt,
    grantedScopes: GOOGLE_SCOPES,
    user,
  }));
}

/**
 * Inicializa Firebase Auth y espera el primer chequeo de sesión.
 */
export async function initAuth() {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase no configurado. Copiá .env.example a .env y completá las variables VITE_FIREBASE_*.'
    );
  }
  await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      unsubscribe();
      if (fbUser) {
        // Firebase ya tiene sesión viva (restaurada por su propia
        // persistencia). Sincronizamos identidad en localStorage, pero
        // el access token de Google (accessToken/tokenExpiresAt) sólo se
        // obtiene en signInWithPopup — si no hay uno cacheado válido,
        // getAccessToken() pedirá forceConsent en la próxima llamada.
        const user = { email: fbUser.email, name: fbUser.displayName || fbUser.email, picture: fbUser.photoURL };
        persistSession(user);
      }
      resolve();
    });
  });
}

/**
 * Returns saved user info if session is still valid.
 */
export function getSavedUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.schemaVersion !== SCHEMA_VERSION) return null;
    if (saved && saved.user && saved.expiresAt > Date.now()) {
      return saved.user;
    }
    // Also return user if session exists but token expired (offline resume)
    if (saved && saved.user) {
      return saved.user;
    }
  } catch {}
  return null;
}

/**
 * Returns true when running as an installed PWA (standalone display mode).
 */
function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true; // iOS Safari
}

/**
 * Solicita token de acceso al usuario vía popup de Firebase/Google.
 *
 * @param {object} options
 * @param {boolean} options.forceConsent  — re-muestra pantalla de consentimiento
 * @param {boolean} options.silent        — sin uso real (ver nota abajo)
 *
 * IMPORTANT: Firebase's GoogleAuthProvider no tiene equivalente al
 * prompt:'none' de GIS (renovación silenciosa en background). Cualquier
 * pedido silent=true falla rápido con 'interaction_required' para que
 * el llamador caiga en su manejo existente de esa condición.
 */
export async function requestAccessToken({ forceConsent = false, silent = false } = {}) {
  if (silent) {
    throw new Error('interaction_required');
  }

  logger.log('[auth] requestAccessToken (popup)', { forceConsent, isPWA: isPWA() });

  googleProvider.setCustomParameters({ prompt: forceConsent ? 'consent' : 'select_account' });

  let result;
  try {
    result = await signInWithPopup(auth, googleProvider);
  } catch (err) {
    logger.warn('[auth] signInWithPopup error:', err?.code, err?.message);
    throw new Error(err?.message || 'Auth error');
  }

  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('No se obtuvo el token de acceso de Google.');
  }

  silentRenewalFailed = false;
  accessToken = credential.accessToken;
  // Firebase no expone expires_in para el access token del proveedor;
  // los tokens OAuth de Google duran ~3600s consistentemente.
  tokenExpiresAt = Date.now() + 3600 * 1000;

  const fbUser = result.user;
  const user = {
    email: fbUser.email,
    name: fbUser.displayName || fbUser.email,
    picture: fbUser.photoURL,
  };
  persistSession(user);

  return { accessToken, ...user };
}

/**
 * Devuelve el access token actual, renovándolo si es necesario.
 *
 * Background renewal (called internally by Drive/Sheets API helpers):
 *   - In PWA mode: bloqueado — Firebase no puede renovar el access token
 *     de Google sin un popup, y los popups en background están bloqueados
 *     en PWAs instaladas.
 *
 * User-initiated (forceConsent=true, e.g. from Sincronizar button):
 *   - Always shows Google popup.
 */
export async function getAccessToken(forceConsent = false) {
  if (!forceConsent && accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }

  // Silent renewal already known to be broken — bail immediately, no log spam
  if (!forceConsent && silentRenewalFailed) {
    throw new Error('interaction_required');
  }

  logger.log('[auth] token expired — attempting renewal', { isPWA: isPWA(), forceConsent });

  if (forceConsent) {
    // User gesture — always show popup
    const result = await requestAccessToken({ forceConsent: true });
    logger.log('[auth] consent renewal succeeded');
    return result.accessToken;
  }

  // Background renewal
  if (isPWA()) {
    // PWA blocks background popups — skip straight to the re-auth banner.
    // Dispatch event on first failure so the UI can show a re-auth banner
    // without waiting for the next syncOfflineQueue run.
    if (!silentRenewalFailed) {
      silentRenewalFailed = true;
      window.dispatchEvent(new CustomEvent('sti-cam:auth-required'));
    }
    throw new Error('interaction_required');
  } else {
    // Regular browser: popup renewal (Firebase has no silent path here)
    const result = await requestAccessToken();
    logger.log('[auth] token renewal succeeded');
    return result.accessToken;
  }
}

/**
 * Invalida el token en memoria y en localStorage, forzando re-auth en la próxima llamada.
 * Útil cuando una API retorna 401/403 por scopes insuficientes.
 */
export function clearToken() {
  accessToken = null;
  tokenExpiresAt = 0;
  silentRenewalFailed = false;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, token: null, expiresAt: 0 }));
    }
  } catch {}
}

/**
 * Revoca el token y cierra sesión.
 */
export async function revokeToken() {
  accessToken = null;
  tokenExpiresAt = 0;
  silentRenewalFailed = false;
  try {
    await fbSignOut(auth);
  } catch {}
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Verifica si hay un token válido.
 */
export function hasValidToken() {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

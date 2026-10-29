/**
 * Infraestructura: Google OAuth 2.0
 * Usa Google Identity Services (GIS) Token Model.
 *
 * El script de GIS se carga dinámicamente.
 * Token y user info persisten en localStorage.
 *
 * v3: Fixed PWA sign-in — separated user-initiated auth (shows popup) from
 *     background token renewal (silent, prompt:'none').
 */

import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from '../config/google.js';
import { logger } from './Logger.js';

const STORAGE_KEY = 'sti-cam-auth';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

/**
 * Module-level flag — set to true when prompt:'none' renewal fails in PWA mode.
 * Callers (like syncOfflineQueue) can check this to know they need to show a
 * manual re-auth UI.
 */
export let silentRenewalFailed = false;

// Restore from localStorage on load
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (saved && saved.token && saved.expiresAt > Date.now() && saved.grantedScopes === GOOGLE_SCOPES) {
    accessToken = saved.token;
    tokenExpiresAt = saved.expiresAt;
  }
} catch {}

function persistSession(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    token: accessToken,
    expiresAt: tokenExpiresAt,
    grantedScopes: GOOGLE_SCOPES,
    user,
  }));
}

/**
 * Carga el script de Google Identity Services.
 */
function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;

    const timer = setTimeout(() => {
      reject(new Error('Google Identity Services script timeout'));
    }, 15000);

    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(script);
  });
}

/**
 * Inicializa el token client de OAuth.
 */
export async function initAuth() {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID no configurado. Crea un archivo .env con tu Client ID.'
    );
  }
  await loadGisScript();
}

/**
 * Returns saved user info if session is still valid.
 */
export function getSavedUser() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
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
 * Solicita token de acceso al usuario.
 *
 * @param {object} options
 * @param {boolean} options.forceConsent  — show consent screen (re-auth)
 * @param {boolean} options.silent        — use prompt:'none' (no UI, background renewal)
 *
 * Prompt logic:
 *   silent=true           → prompt:'none'  (no popup, cookie-based renewal)
 *   forceConsent=true      → prompt:'consent' (force re-consent)
 *   otherwise              → prompt:''      (default: shows account picker if needed)
 *
 * IMPORTANT: For user-initiated sign-in, do NOT pass silent=true.
 *            silent=true is ONLY for background token renewal.
 */
export function requestAccessToken({ forceConsent = false, silent = false } = {}) {
  return new Promise((resolve, reject) => {
    let prompt;
    if (silent) {
      prompt = 'none';
    } else if (forceConsent) {
      prompt = 'consent';
    } else {
      prompt = '';  // default — GIS decides (account picker if multiple accounts)
    }

    let timer = null;
    if (silent) {
      timer = setTimeout(() => {
        reject(new Error('Silent token renewal timed out.'));
      }, 15000);
    }

    const clearTimer = () => { if (timer) clearTimeout(timer); };

    logger.log('[auth] requestAccessToken', { prompt, isPWA: isPWA(), forceConsent, silent });

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES,
      prompt,
      callback: (response) => {
        if (response.error) {
          clearTimer();
          logger.warn('[auth] token response error:', response.error, response.error_description);
          reject(new Error(response.error_description || response.error));
          return;
        }
        // Renewal succeeded — clear the failure flag
        silentRenewalFailed = false;
        accessToken = response.access_token;
        tokenExpiresAt = Date.now() + (response.expires_in || 3600) * 1000;

        const controller = new AbortController();
        const fetchTimer = setTimeout(() => controller.abort(), 10000);

        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        })
          .then((r) => r.json())
          .then((info) => {
            clearTimeout(fetchTimer);
            const user = {
              email: info.email,
              name: info.name || info.email,
              picture: info.picture,
            };
            persistSession(user);
            clearTimer();
            resolve({ accessToken, ...user });
          })
          .catch(() => {
            clearTimeout(fetchTimer);
            persistSession(null);
            clearTimer();
            resolve({ accessToken, email: '', name: '' });
          });
      },
      error_callback: (err) => {
        clearTimer();
        logger.warn('[auth] error_callback:', err);
        reject(new Error(err.message || 'Auth error'));
      },
    });

    tokenClient.requestAccessToken();
  });
}

/**
 * Devuelve el access token actual, renovándolo si es necesario.
 *
 * Background renewal (called internally by Drive/Sheets API helpers):
 *   - In PWA mode: uses silent renewal (prompt:'none') — no popup mid-upload.
 *   - If silent renewal fails, retries once after 1s (GIS iframe loading race).
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
    // PWA blocks the GIS silent-renewal iframe (prompt:'none') — skip it entirely.
    // Dispatch event on first failure so the UI can show a re-auth banner
    // without waiting for the next syncOfflineQueue run.
    if (!silentRenewalFailed) {
      silentRenewalFailed = true;
      window.dispatchEvent(new CustomEvent('sti-cam:auth-required'));
    }
    throw new Error('interaction_required');
  } else {
    // Regular browser: default prompt (account picker if needed)
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
export function revokeToken() {
  if (accessToken) {
    window.google?.accounts?.oauth2?.revoke(accessToken);
    accessToken = null;
    tokenExpiresAt = 0;
  }
  // Reset silent renewal flag so the next sign-in attempt is not blocked.
  silentRenewalFailed = false;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Verifica si hay un token válido.
 */
export function hasValidToken() {
  return !!accessToken && Date.now() < tokenExpiresAt;
}

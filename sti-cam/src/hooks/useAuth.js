import { useState, useEffect, useCallback } from 'react';
import { initAuth, requestAccessToken, revokeToken, hasValidToken, getSavedUser } from '../infrastructure/GoogleAuth';
import { GOOGLE_CLIENT_ID } from '../config/google';

/**
 * Hook de autenticación con Google.
 * Maneja login, logout, y estado del usuario.
 *
 * Offline behaviour:
 * - If a saved session exists and the device is offline, restore the user
 *   immediately without loading the GIS script (which requires network).
 * - initAuth() is retried silently when the device comes back online so that
 *   the token client is ready for the next upload sync.
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Verificar si el Client ID está configurado
  const isConfigured = !!GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const saved = getSavedUser();

    // Offline with a known session — restore immediately, skip GIS load
    if (!navigator.onLine && saved) {
      setUser(saved);
      setLoading(false);
      // Retry initAuth silently when connectivity returns
      const onOnline = () => initAuth().catch(() => {});
      window.addEventListener('online', onOnline, { once: true });
      return () => window.removeEventListener('online', onOnline);
    }

    initAuth()
      .then(() => {
        if (saved) setUser(saved);
        setLoading(false);
      })
      .catch((err) => {
        // GIS script failed to load — if we have a saved session still let them in
        if (saved) {
          setUser(saved);
        } else {
          setError(err.message);
        }
        setLoading(false);
      });
  }, [isConfigured]);

  const signIn = useCallback(async () => {
    if (!isConfigured) {
      // Modo demo sin Google configurado
      setUser({ email: 'demo@sticam.local', name: 'Modo Demo', picture: null });
      return;
    }

    setError(null);
    try {
      const result = await requestAccessToken();
      setUser({
        email: result.email,
        name: result.name,
        picture: result.picture,
      });
    } catch (err) {
      setError(err.message);
    }
  }, [isConfigured]);

  const signOut = useCallback(() => {
    revokeToken();
    setUser(null);
  }, []);

  return {
    user,
    loading,
    error,
    isConfigured,
    isAuthenticated: !!user,
    signIn,
    signOut,
  };
}

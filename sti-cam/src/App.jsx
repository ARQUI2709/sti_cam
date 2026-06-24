import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useUploadQueue } from './hooks/useUploadQueue';
import { CameraService } from './infrastructure/CameraService';
import { loadQueue } from './infrastructure/OfflineQueue';
import { hasValidToken, getAccessToken, getSavedUser, silentRenewalFailed } from './infrastructure/GoogleAuth';

import AuthScreen from './screens/AuthScreen';
import HomeScreen from './screens/HomeScreen';
import CameraScreen from './screens/CameraScreen';
import { colors, font, radius } from './styles/theme';
import { logger } from './infrastructure/Logger';
import DebugOverlay from './components/DebugOverlay';

export default function App() {
  const auth = useAuth();
  const [activeScreen, setActiveScreen] = useState('home'); // 'home' | 'camera'
  const [selectedProject, setSelectedProject] = useState(null);
  const [queue, setQueue] = useState([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [offlineBanner, setOfflineBanner] = useState(null); // null | { count, needsAuth }
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showDebug, setShowDebug] = useState(false);

  // Keep a ref to queue so sync callbacks never see stale state
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const syncInProgressRef = useRef(false);

  const addToQueue = useCallback((item) => {
    setQueue((prev) => {
      // Avoid duplicates when retrying from IDB
      if (prev.some((q) => q.id === item.id)) return prev;
      return [item, ...prev];
    });
    setSessionCount((c) => c + 1);
  }, []);

  const updateQueueItem = useCallback((id, updates) => {
    setQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  }, []);

  const { enqueueUpload, retryOfflineQueue } = useUploadQueue({ updateQueueItem });

  // Ref for retry timer so we can cancel it on cleanup
  const retryTimerRef = useRef(null);

  // Listen for PWA silent-renewal failures from GoogleAuth and surface re-auth banner
  useEffect(() => {
    const onAuthRequired = () => setNeedsReauth(true);
    window.addEventListener('sti-cam:auth-required', onAuthRequired);
    return () => window.removeEventListener('sti-cam:auth-required', onAuthRequired);
  }, []);

  /**
   * Check IDB for pending photos and flush them.
   * Uses queueRef instead of queue to avoid stale closure issues.
   * Never auto-triggers token refresh — that requires a user gesture on mobile.
   */
  const syncOfflineQueue = useCallback(async () => {
    if (syncInProgressRef.current) {
      logger.log('[sync] already in progress — skipping');
      return;
    }
    syncInProgressRef.current = true;
    try {
      logger.log('[sync] syncOfflineQueue called', {
        isAuthenticated: auth.isAuthenticated,
        online: navigator.onLine,
      });

      if (!auth.isAuthenticated || !navigator.onLine) {
        logger.log('[sync] skipping — not authenticated or offline');
        return;
      }

      let pending;
      try {
        pending = await loadQueue();
        logger.log('[sync] IDB queue loaded:', pending.length, 'items');
      } catch (e) {
        logger.warn('[sync] failed to load IDB queue:', e);
        return;
      }

      // Read from ref — never stale
      const currentQueue = queueRef.current;
      const activeIds = new Set(
        currentQueue
          .filter((q) => q.status === 'uploading' || q.status === 'done' || q.status === 'pending')
          .map((q) => q.id)
      );
      const fresh = pending.filter((p) => !activeIds.has(p.id));
      logger.log('[sync] activeIds:', activeIds.size, '| fresh to process:', fresh.length);

      if (fresh.length === 0) return;

      if (silentRenewalFailed) {
        logger.log('[sync] silent renewal previously failed — showing re-auth banner');
        setOfflineBanner({ count: fresh.length, needsAuth: true, items: fresh });
        return;
      }

      if (hasValidToken()) {
        logger.log('[sync] token valid — flushing silently');
        try {
          await retryOfflineQueue(fresh, addToQueue);
          logger.log('[sync] flush complete');
        } catch (e) {
          logger.warn('[sync] flush failed:', e);
        }
      } else {
        logger.log('[sync] token expired — showing banner for user action');
        setOfflineBanner({ count: fresh.length, needsAuth: true, items: fresh });
      }
    } finally {
      syncInProgressRef.current = false;
    }
  }, [auth.isAuthenticated, retryOfflineQueue, addToQueue]);
  // Note: queue removed from deps — we read queueRef.current instead

  /**
   * Retry sync with exponential backoff.
   * Handles the case where 'online' fires before DNS/routes are fully restored.
   */
  const syncWithRetry = useCallback(async () => {
    const delays = [0, 2000, 5000, 10000]; // immediate, 2s, 5s, 10s
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        logger.log(`[sync] retry attempt ${attempt + 1} in ${delays[attempt]}ms`);
        await new Promise((resolve) => {
          retryTimerRef.current = setTimeout(resolve, delays[attempt]);
        });
      }
      if (!navigator.onLine) {
        logger.log('[sync] went offline during retry — aborting');
        return;
      }
      try {
        await syncOfflineQueue();
        // Check if there are still pending items in IDB
        const remaining = await loadQueue();
        if (remaining.length === 0) {
          logger.log('[sync] all items flushed — done');
          return;
        }
        logger.log('[sync] still', remaining.length, 'items in IDB after attempt', attempt + 1);
      } catch (e) {
        logger.warn(`[sync] attempt ${attempt + 1} failed:`, e);
      }
    }
  }, [syncOfflineQueue]);

  // On mount: flush IDB queue if we're already online
  useEffect(() => {
    if (navigator.onLine) syncWithRetry();
  }, [auth.isAuthenticated]); // re-run when user logs in

  // Track online/offline + visibilitychange (mobile resumes miss the 'online' event)
  useEffect(() => {
    const onOnline = () => {
      logger.log('[sync] online event fired — waiting 3s for connection to stabilise');
      setIsOffline(false);
      // iOS fires `online` before the radio is fully usable; a short delay
      // dramatically reduces "Load failed" errors on the first upload attempt.
      setTimeout(syncWithRetry, 3000);
    };
    const onOffline = () => {
      logger.log('[sync] offline event fired');
      setIsOffline(true);
      // Cancel any pending retry
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    const onVisible = () => {
      if (!document.hidden) {
        logger.log('[sync] visibilitychange — app foregrounded');
        syncWithRetry();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [syncWithRetry]);

  // Periodic safety-net: every 30s, if there are still items in IDB and we're
  // online + authenticated, attempt another silent flush. This catches the case
  // where the 'online' event never fired (PWA on mobile is unreliable) or where
  // the initial retry burst failed because the network wasn't ready yet.
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const pending = await loadQueue();
        if (pending.length === 0) return;
        logger.log(`[sync] periodic check — ${pending.length} items pending, attempting flush`);
        syncOfflineQueue();
      } catch (_) {}
    }, 30000);
    return () => clearInterval(interval);
  }, [auth.isAuthenticated, syncOfflineQueue]);

  /**
   * Manual retry triggered by user gesture (Reintentar button or banner).
   * Always attempts to flush IDB, forcing a popup-based token refresh if the
   * current token is invalid — this works around PWA cookie restrictions that
   * make silent renewal fail.
   */
  const manualRetry = useCallback(async () => {
    if (!navigator.onLine) {
      logger.log('[sync] manualRetry — still offline, skipping');
      return;
    }
    // Re-auth first if needed (user gesture — triggers real popup)
    if (!hasValidToken()) {
      try {
        logger.log('[sync] manualRetry — token invalid, requesting fresh via popup');
        await getAccessToken(true);
      } catch (e) {
        logger.warn('[sync] manualRetry — re-auth failed:', e);
        return;
      }
    }
    setNeedsReauth(false);
    setOfflineBanner(null);
    // Flush any pending IDB items now that we have a valid token
    let pending;
    try { pending = await loadQueue(); } catch { return; }
    if (pending.length === 0) return;
    const currentQueue = queueRef.current;
    const activeIds = new Set(
      currentQueue
        .filter((q) => q.status === 'uploading' || q.status === 'done' || q.status === 'pending')
        .map((q) => q.id)
    );
    const fresh = pending.filter((p) => !activeIds.has(p.id));
    if (fresh.length === 0) return;
    try {
      logger.log('[sync] manualRetry — flushing', fresh.length, 'items');
      await retryOfflineQueue(fresh, addToQueue);
      logger.log('[sync] manualRetry complete');
    } catch (e) {
      logger.warn('[sync] manualRetry flush failed:', e);
    }
  }, [retryOfflineQueue, addToQueue]);

  if (!auth.isAuthenticated) {
    return <AuthScreen onSignIn={auth.signIn} savedUser={getSavedUser()} isOffline={isOffline} />;
  }

  // Compute offline count for status bar
  const offlineCount = queue.filter((q) => q.status === 'offline').length;

  const screen = activeScreen === 'camera' && selectedProject
    ? (
      <CameraScreen
        project={selectedProject}
        queue={queue}
        sessionCount={sessionCount}
        addToQueue={addToQueue}
        updateQueueItem={updateQueueItem}
        enqueueUpload={enqueueUpload}
        onClose={() => setActiveScreen('home')}
      />
    )
    : (
      <HomeScreen
        user={auth.user}
        selectedProject={selectedProject}
        onSelectProject={setSelectedProject}
        queue={queue}
        sessionCount={sessionCount}
        onOpenCamera={() => setActiveScreen('camera')}
        addToQueue={addToQueue}
        enqueueUpload={enqueueUpload}
        onSignOut={() => { CameraService.release(); auth.signOut(); }}
        isOffline={isOffline}
        offlineCount={offlineCount}
        onRetrySync={manualRetry}
      />
    );

  return (
    <>
      {screen}
      {(needsReauth || offlineBanner) && (
        <div style={styles.banner}>
          <span style={styles.bannerText}>
            {needsReauth || offlineBanner?.needsAuth
              ? 'Sesión expirada — inicia sesión para continuar'
              : `${offlineBanner.count} foto${offlineBanner.count !== 1 ? 's' : ''} pendiente${offlineBanner.count !== 1 ? 's' : ''}`}
          </span>
          <button onClick={manualRetry} style={styles.bannerBtn}>
            Iniciar sesión
          </button>
          <button onClick={() => { setNeedsReauth(false); setOfflineBanner(null); }} style={styles.bannerDismiss}>✕</button>
        </div>
      )}
      <button
        onClick={() => setShowDebug((v) => !v)}
        style={styles.debugToggle}
        aria-label="Debug log"
        title="Debug log"
      >
        ⓘ
      </button>
      {showDebug && <DebugOverlay onClose={() => setShowDebug(false)} />}
    </>
  );
}

const styles = {
  banner: {
    position: 'fixed', bottom: 72, left: 16, right: 16, zIndex: 200,
    background: '#2a2830', border: `1px solid ${colors.border}`,
    borderRadius: radius.md, padding: '12px 16px',
    display: 'flex', alignItems: 'center', gap: 10,
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  bannerText: {
    flex: 1, fontSize: font.sm, color: colors.text, fontFamily: font.family,
  },
  bannerBtn: {
    padding: '6px 14px', borderRadius: radius.sm,
    background: colors.accent, border: 'none',
    color: 'white', fontSize: font.sm, fontWeight: 600, cursor: 'pointer',
    fontFamily: font.family,
  },
  bannerDismiss: {
    background: 'none', border: 'none', color: colors.textMuted,
    fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
  },
  debugToggle: {
    position: 'fixed', bottom: 12, right: 12, zIndex: 150,
    width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${colors.border}`,
    color: colors.textMuted, fontSize: 14, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  },
};

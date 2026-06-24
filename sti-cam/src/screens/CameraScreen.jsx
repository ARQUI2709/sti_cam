import { useState, useRef, useEffect, useCallback } from 'react';
import { useCamera } from '../hooks/useCamera';
import { createPhoto } from '../domain/Photo';
import { getProject } from '../config/projects';
import ShutterButton from '../components/ShutterButton';
import UploadQueueSheet from '../components/UploadQueueSheet';
import Footer from '../components/Footer';
import { colors, font, radius, globalStyles } from '../styles/theme';

export default function CameraScreen({
  project, queue, sessionCount, addToQueue, updateQueueItem, enqueueUpload, onClose,
}) {
  const videoRef = useRef(null);
  const captureInputRef = useRef(null);
  const camera = useCamera();

  const [flashAnim, setFlashAnim] = useState(false);
  const [lastThumb, setLastThumb] = useState(null);
  const [showQueue, setShowQueue] = useState(false);
  const lastLocation = useRef(null);  // cached GPS position

  const projectInfo = getProject(project);
  const uploadingCount = queue.filter((q) => q.status === 'uploading').length;
  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const doneCount = queue.filter((q) => q.status === 'done').length;

  // Clear thumbnail once all uploads are settled
  useEffect(() => {
    if (lastThumb && uploadingCount === 0 && pendingCount === 0 && queue.length > 0) {
      setLastThumb(null);
    }
  }, [uploadingCount, pendingCount, queue.length]);

  // Watch GPS continuously while camera is open
  useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        lastLocation.current = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
        };
      },
      null,
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Live preview as a viewfinder only — the actual capture uses the native camera.
  useEffect(() => {
    if (videoRef.current) {
      camera.start(videoRef.current);
    }
    return () => camera.stop();
  }, []);

  // Capture via the native iOS/Android camera (full sensor resolution + EXIF).
  // The <input capture> opens the device's real camera app and returns a single
  // full-quality file, bypassing the resolution-capped getUserMedia preview frame.
  const handleNativeCapture = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const blob = file.slice(0, file.size, file.type || 'image/jpeg');

    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 150);

    const photo = createPhoto({
      blob,
      projectId: project,
      projectName: projectInfo?.name,
      sessionNumber: sessionCount + 1,
      location: lastLocation.current,
    });

    setLastThumb(photo.thumbUrl);
    addToQueue({
      id: photo.id,
      projectId: photo.projectId,
      name: photo.fileName,
      size: photo.sizeLabel,
      thumb: photo.thumbUrl,
      status: 'pending',
      progress: 0,
    });
    enqueueUpload(photo);
  }, [project, projectInfo, sessionCount, addToQueue, enqueueUpload]);

  return (
    <div style={styles.fullscreen}>
      <style>{globalStyles}</style>

      <video ref={videoRef} playsInline muted autoPlay style={styles.video} />

      {flashAnim && <div style={styles.flash} />}

      {/* Top bar */}
      <div style={styles.topBar}>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
        <div style={styles.projectBadge}>
          {projectInfo?.icon} {projectInfo?.name}
        </div>
      </div>

      {/* Hidden input — opens the native camera at full sensor resolution */}
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleNativeCapture}
      />

      {/* Bottom controls */}
      <div style={styles.bottomBar}>
        {/* Last capture preview */}
        <div style={styles.sideSlot}>
          <div style={styles.galleryStack}>
            {lastThumb && (
              <div onClick={() => setShowQueue(true)} style={styles.lastThumb}>
                <img src={lastThumb} alt="" style={styles.thumbImg} />
                {uploadingCount > 0 && (
                  <div style={styles.thumbBadge}>{uploadingCount}</div>
                )}
              </div>
            )}
          </div>
        </div>

        <ShutterButton onPress={() => captureInputRef.current?.click()} />

        {/* Upload status */}
        <div style={styles.sideSlot}>
          {queue.length > 0 && (
            <div style={styles.miniStatus}>
              <span style={{ color: uploadingCount > 0 ? colors.accent : colors.success, fontSize: 11, fontWeight: 600 }}>
                {uploadingCount > 0 ? `⬆${uploadingCount}` : '✓'}
              </span>
              <span style={{ color: colors.textMuted, fontSize: 10 }}>
                {doneCount}/{queue.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {showQueue && <UploadQueueSheet queue={queue} onClose={() => setShowQueue(false)} />}

      {camera.error && (
        <div style={styles.errorOverlay}>
          <p style={styles.errorText}>{camera.error}</p>
          <button onClick={onClose} style={styles.errorBtn}>Volver</button>
        </div>
      )}

      {!camera.isReady && !camera.error && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner} />
          <p style={{ color: colors.textMuted, fontSize: 13 }}>Iniciando cámara...</p>
        </div>
      )}
      <Footer styleContent={{ position: 'absolute', bottom: 0, padding: '8px 16px', zIndex: 30 }} />
    </div>
  );
}

const styles = {
  fullscreen: {
    position: 'fixed', inset: 0, background: '#000', zIndex: 100,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    fontFamily: font.family,
  },
  video: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' },
  flash: {
    position: 'absolute', inset: 0, background: 'white', zIndex: 10,
    animation: 'flashFade 0.15s ease forwards', pointerEvents: 'none',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: 'max(52px, calc(env(safe-area-inset-top, 0px) + 12px)) 16px 12px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)', border: 'none',
    color: 'white', fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  projectBadge: {
    flex: 1, fontSize: 13, color: 'white', fontWeight: 500,
    background: 'rgba(255,255,255,0.1)', padding: '6px 12px',
    borderRadius: radius.md, backdropFilter: 'blur(8px)', textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 32px 48px',
    background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
  },
  sideSlot: {
    width: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  galleryStack: {
    position: 'relative', width: 52, height: 52,
  },
  lastThumb: {
    position: 'absolute', inset: 0,
    borderRadius: 10, overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.3)',
    cursor: 'pointer', animation: 'popIn 0.2s ease',
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbBadge: {
    position: 'absolute', top: -6, right: -6,
    minWidth: 18, height: 18, borderRadius: 9,
    background: colors.accent, color: 'white',
    fontSize: 10, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
  },
  miniStatus: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: 'rgba(0,0,0,0.4)', padding: '6px 10px', borderRadius: radius.md,
    backdropFilter: 'blur(4px)',
  },
  errorOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 40, color: colors.text, gap: 16,
  },
  errorText: { fontSize: 14, textAlign: 'center', padding: 24, margin: 0 },
  errorBtn: {
    padding: '12px 24px', borderRadius: radius.md, background: colors.accent,
    border: 'none', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  loadingOverlay: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', zIndex: 30, gap: 16,
  },
  spinner: {
    width: 36, height: 36, border: '3px solid rgba(255,255,255,0.2)',
    borderTopColor: colors.accent, borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};

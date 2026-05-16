import { useState, useRef, useEffect, useCallback } from 'react';
import { useCamera } from '../hooks/useCamera';
import { createPhoto } from '../domain/Photo';
import { getProject } from '../config/projects';
import AspectPicker from '../components/AspectPicker';
import ShutterButton from '../components/ShutterButton';
import UploadQueueSheet from '../components/UploadQueueSheet';
import Footer from '../components/Footer';
import { colors, font, radius, globalStyles } from '../styles/theme';
import galleryIcon from '../assets/images.svg';

const ASPECTS = ['4:3', '1:1', 'full'];

export default function CameraScreen({
  project, queue, sessionCount, addToQueue, updateQueueItem, enqueueUpload, onClose,
}) {
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const camera = useCamera();

  const [aspect, setAspect] = useState('full');
  const [flashAnim, setFlashAnim] = useState(false);
  const [lastThumb, setLastThumb] = useState(null);
  const [showQueue, setShowQueue] = useState(false);

  // Zoom state
  const [zoomRange, setZoomRange] = useState(null);  // { min, max, step } or null
  const [zoom, setZoom] = useState(1);
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

  useEffect(() => {
    if (videoRef.current) {
      camera.start(videoRef.current).then((zoomCaps) => {
        if (zoomCaps) {
          setZoomRange(zoomCaps);
          setZoom(1);
          camera.setZoom(1);
        }
      });
    }
    return () => camera.stop();
  }, []);

  // Apply zoom via track constraints
  const handleZoomChange = useCallback(async (value) => {
    setZoom(value);
    await camera.setZoom(value);
  }, [camera]);

  const handleCapture = useCallback(async () => {
    if (!camera.isReady) return;

    const blob = await camera.capture(aspect);
    if (!blob) return;

    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 150);

    const num = sessionCount + 1;
    const photo = createPhoto({
      blob,
      projectId: project,
      projectName: projectInfo?.name,
      sessionNumber: num,
      location: lastLocation.current,
      captureInfo: camera.getCaptureInfo(),
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
  }, [camera, aspect, project, sessionCount, addToQueue, enqueueUpload]);

  // Import photo(s) from device gallery, preserving original file metadata
  const handleGalleryFile = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const blob = file.slice(0, file.size, file.type || 'image/jpeg');
      const photo = createPhoto({
        blob,
        projectId: project,
        projectName: projectInfo?.name,
        sessionNumber: sessionCount + i + 1,
        sourceDate: file.lastModified,   // preserve original file date
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
    }
  }, [project, sessionCount, addToQueue, enqueueUpload]);

  return (
    <div style={styles.fullscreen}>
      <style>{globalStyles}</style>

      <video ref={videoRef} playsInline muted autoPlay style={styles.video} />

      {/* Aspect ratio crop overlay */}
      {aspect !== 'full' && (
        <div style={styles.cropOverlay}>
          <div style={styles.cropLetterbox} />
          <div style={{
            ...styles.cropCenter,
            aspectRatio: aspect === '4:3' ? '3/4' : '1/1',
          }} />
          <div style={styles.cropLetterbox} />
        </div>
      )}

      {flashAnim && <div style={styles.flash} />}

      {/* Top bar */}
      <div style={styles.topBar}>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
        <div style={styles.projectBadge}>
          {projectInfo?.icon} {projectInfo?.name}
        </div>
      </div>

      <AspectPicker aspects={ASPECTS} selected={aspect} onChange={setAspect} />

      {/* Zoom slider — shown only when the camera supports zoom */}
      {zoomRange && (
        <div style={styles.zoomBar}>
          <span style={styles.zoomLabel}>{zoom.toFixed(1)}×</span>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step || 0.1}
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            style={styles.zoomSlider}
          />
        </div>
      )}

      {/* Bottom controls */}
      <div style={styles.bottomBar}>
        {/* Gallery import */}
        <div style={styles.sideSlot}>
          <div style={styles.galleryStack}>
            <button onClick={() => fileInputRef.current?.click()} style={styles.iconBtn}>
              <img src={galleryIcon} alt="Galería" style={styles.iconImg} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleGalleryFile}
            />
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

        <ShutterButton onPress={handleCapture} disabled={!camera.isReady} />

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
  cropOverlay: {
    position: 'absolute', inset: 0, zIndex: 5,
    display: 'flex', flexDirection: 'column', pointerEvents: 'none',
  },
  cropLetterbox: { flex: 1, background: 'rgba(0,0,0,0.5)' },
  cropCenter: {
    width: '100%', flexShrink: 0,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)',
  },
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
  // Zoom bar sits above the bottom controls
  zoomBar: {
    position: 'absolute', bottom: 200, left: 24, right: 24, zIndex: 20,
    display: 'flex', alignItems: 'center', gap: 10,
  },
  zoomLabel: {
    color: 'white', fontSize: 12, fontWeight: 600,
    width: 34, textAlign: 'right', flexShrink: 0,
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  zoomSlider: {
    flex: 1, height: 3, accentColor: colors.accent, cursor: 'pointer',
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
  iconBtn: {
    width: '100%', height: '100%', borderRadius: '50%',
    background: 'none', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
  },
  iconImg: {
    width: 44, height: 44, objectFit: 'contain',
    borderRadius: '30%', overflow: 'hidden',
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

import { useState, useEffect } from 'react';
import { colors, font, spacing, radius, globalStyles } from '../styles/theme';

const InstallIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16l-4-4h3V4h2v8h3l-4 4z"/>
    <path d="M20 18H4v2h16v-2z"/>
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
);

import logoImg from '../assets/icon.svg';
import cloudImg from '../assets/cloud.svg';
import lensImg from '../assets/lens.svg';
import imagesImg from '../assets/images.svg';
import Footer from '../components/Footer';

const FEATURES = [
  { text: 'Fotos directo a Google Drive', icon: cloudImg },
  { text: 'Captura instantánea — sin confirmación', icon: lensImg },
  { text: 'Modo continuo — tap, tap, tap', icon: imagesImg },
];

/**
 * AuthScreen receives:
 *   onSignIn     — triggers Google OAuth popup (requires network)
 *   savedUser    — user info from localStorage (available offline)
 *   isOffline    — true when navigator.onLine === false
 */
export default function AuthScreen({ onSignIn, savedUser, isOffline }) {
  const [visible, setVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 100);

    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  // Offline + known session: show identity confirmation instead of sign-in button
  const showOfflineResume = isOffline && !!savedUser;

  return (
    <div style={styles.container}>
      <style>{globalStyles}</style>
      <div style={{
        ...styles.inner,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.6s ease',
      }}>
        <div style={styles.logoWrap}>
          <img src={logoImg} alt="STI-Cam Logo" style={styles.logoImg} />
          <h1 style={styles.title}>STI-Cam</h1>
          <p style={styles.subtitle}>Registro fotográfico de obra</p>
        </div>

        {showOfflineResume ? (
          <>
            <div style={styles.offlineCard}>
              <div style={styles.offlineDot} />
              <div style={styles.offlineInfo}>
                <span style={styles.offlineName}>{savedUser.name}</span>
                <span style={styles.offlineEmail}>{savedUser.email}</span>
              </div>
            </div>
            <button onClick={onSignIn} style={styles.btn}>
              <span>Continuar sin conexión</span>
            </button>
            <p style={styles.note}>Las fotos se guardarán localmente y se subirán cuando haya conexión.</p>
          </>
        ) : (
          <>
            <div style={styles.features}>
              {FEATURES.map((f, i) => (
                <div key={i} style={styles.featureRow}>
                  <img src={f.icon} alt="" style={styles.featureIcon} />
                  <span style={styles.featureText}>{f.text}</span>
                </div>
              ))}
            </div>

            <button onClick={onSignIn} style={styles.btn}>
              <GoogleIcon />
              <span>Iniciar sesión con Google</span>
            </button>

            {!installed && installPrompt && (
              <button onClick={handleInstall} style={styles.installBtn}>
                <InstallIcon />
                <span>Instalar app</span>
              </button>
            )}

            <p style={styles.note}>Se requiere acceso a Google Drive para guardar y organizar tus fotos.</p>
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

const styles = {
  container: {
    fontFamily: font.family, background: '#19181e',
    minHeight: '100dvh', color: colors.text,
    maxWidth: 480, margin: '0 auto',
    display: 'flex', flexDirection: 'column',
  },
  inner: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', flex: 1,
    padding: `${spacing.xxxl}px ${spacing.xxl}px`, gap: spacing.xxxl,
  },
  logoWrap: { textAlign: 'center' },
  logoImg: {
    width: 104, height: 104, objectFit: 'contain',
    margin: '0 auto 16px', display: 'block',
  },
  title: {
    fontSize: font.title, fontWeight: 700, color: colors.textWhite,
    margin: 0, letterSpacing: '-0.02em',
  },
  subtitle: { fontSize: font.base, color: colors.textMuted, marginTop: 4 },
  features: {
    display: 'flex', flexDirection: 'column', gap: spacing.md,
    width: '100%', maxWidth: 280,
  },
  featureRow: { display: 'flex', alignItems: 'center', gap: spacing.sm + 2 },
  featureIcon: { width: 22, height: 22, objectFit: 'contain' },
  featureText: { fontSize: font.base, color: colors.text },
  btn: {
    display: 'flex', alignItems: 'center', gap: spacing.sm + 2,
    padding: `${spacing.md}px ${spacing.xxl}px`, borderRadius: radius.md,
    border: `1px solid ${colors.borderLight}`, background: colors.bgInput,
    color: colors.textWhite, fontSize: font.lg, fontWeight: 500,
    cursor: 'pointer', width: '100%', maxWidth: 280, justifyContent: 'center',
  },
  installBtn: {
    display: 'flex', alignItems: 'center', gap: spacing.sm + 2,
    padding: `${spacing.sm + 2}px ${spacing.xxl}px`, borderRadius: radius.md,
    border: `1px solid ${colors.border}`, background: 'transparent',
    color: colors.textMuted, fontSize: font.base, fontWeight: 500,
    cursor: 'pointer', width: '100%', maxWidth: 280, justifyContent: 'center',
  },
  offlineCard: {
    display: 'flex', alignItems: 'center', gap: spacing.md,
    background: colors.bgInput, border: `1px solid ${colors.border}`,
    borderRadius: radius.md, padding: `${spacing.md}px ${spacing.lg}px`,
    width: '100%', maxWidth: 280,
  },
  offlineDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: colors.textDim, flexShrink: 0,
  },
  offlineInfo: {
    display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden',
  },
  offlineName: {
    fontSize: font.base, fontWeight: 600, color: colors.textWhite,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  offlineEmail: {
    fontSize: font.sm, color: colors.textMuted,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  note: { fontSize: font.sm, color: colors.textDim, textAlign: 'center' },
};

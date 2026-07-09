/**
 * Configuración de Firebase Authentication
 *
 * Usa el mismo proyecto Firebase que respalda Sti-platform, para que el
 * login de STI-Cam comparta backend de identidad.
 *
 * SETUP:
 * 1. Firebase Console → proyecto de Sti-platform → Authentication →
 *    Sign-in method → habilitar proveedor "Google"
 * 2. Authentication → Settings → Authorized domains → agregar localhost
 *    y el dominio de despliegue (GitHub Pages)
 * 3. Project Settings → General → Your apps → registrar/usar una Web app
 *    y copiar sus valores de configuración abajo (vía variables VITE_FIREBASE_*)
 * 4. El proyecto GCP subyacente necesita Drive API + Sheets API habilitadas,
 *    y los scopes drive.file / spreadsheets agregados en OAuth consent screen
 *    → Scopes (son scopes sensibles adicionales a los básicos de Firebase Auth)
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = !!(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

// Evita "Firebase App already exists" en HMR de desarrollo
export const firebaseApp = isFirebaseConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

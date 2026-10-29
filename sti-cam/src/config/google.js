/**
 * Configuración de Google OAuth 2.0
 * 
 * SETUP:
 * 1. Ve a https://console.cloud.google.com
 * 2. Crea un proyecto nuevo (o usa uno existente)
 * 3. Habilita "Google Drive API" en APIs & Services
 * 4. Ve a Credentials → Create Credentials → OAuth 2.0 Client ID
 * 5. Tipo: Web Application
 * 6. Authorized JavaScript origins:
 *    - http://localhost:5173          (desarrollo)
 *    - https://TU_USUARIO.github.io  (producción)
 * 7. Copia el Client ID aquí abajo
 * 8. En OAuth consent screen → Test users: agrega tu email
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',        // Drive files created by the app
  'https://www.googleapis.com/auth/spreadsheets',      // Create & update Sheets
].join(' ');

export const GOOGLE_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Nombre de la carpeta raíz en Drive
export const DRIVE_ROOT_FOLDER = 'STI-Fotos';

/**
 * Configuración de Google Drive / Sheets (scopes y carpeta raíz).
 *
 * El login en sí usa Firebase Authentication (ver src/config/firebase.js),
 * pero Drive y Sheets se llaman directo por REST con un access token OAuth
 * de Google que requiere estos scopes — deben estar habilitados en el
 * OAuth consent screen del proyecto GCP detrás de Firebase.
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',        // Drive files created by the app
  'https://www.googleapis.com/auth/spreadsheets',      // Create & update Sheets
].join(' ');

// Nombre de la carpeta raíz en Drive
export const DRIVE_ROOT_FOLDER = 'STI-Fotos';

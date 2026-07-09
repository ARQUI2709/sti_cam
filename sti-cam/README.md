# STI-Cam 📸

Registro fotográfico de obra — fotos directo a Google Drive, sin pasar por Google Photos.

## Arquitectura

```
src/
├── config/           # Configuración (proyectos, Google OAuth, Firebase)
│   ├── projects.js   # Lista editable de proyectos
│   ├── google.js     # Scopes de Drive/Sheets, carpeta raíz
│   └── firebase.js   # Config de Firebase (login)
├── domain/           # Lógica de negocio (pura, sin dependencias externas)
│   ├── Photo.js      # Entidad: foto capturada
│   └── UploadManager.js  # Servicio: cola de subida con concurrencia
├── infrastructure/   # Adaptadores a servicios externos
│   ├── GoogleAuth.js     # Login con Firebase Auth (proveedor Google)
│   ├── GoogleDrive.js    # Drive API v3 (carpetas + upload)
│   └── CameraService.js  # getUserMedia wrapper
├── hooks/            # React hooks (puente presentación ↔ infraestructura)
│   ├── useAuth.js
│   ├── useCamera.js
│   └── useUploadQueue.js
├── screens/          # Pantallas completas
│   ├── AuthScreen.jsx
│   ├── HomeScreen.jsx
│   └── CameraScreen.jsx
├── components/       # Componentes reutilizables
│   ├── ProjectSelector.jsx
│   ├── ShutterButton.jsx
│   ├── AspectPicker.jsx
│   ├── UploadStatusBar.jsx
│   └── UploadQueueSheet.jsx
├── styles/
│   └── theme.js      # Colores, tipografía, constantes
├── App.jsx           # Router principal
└── main.jsx          # Entry point
```

## Setup rápido

### 1. Clonar e instalar

```bash
git clone https://github.com/TU_USUARIO/sti-cam.git
cd sti-cam
pnpm install
```

### 2. Configurar Firebase + Google Cloud (10 min)

STI-Cam usa **Firebase Authentication** (proveedor Google) para el login —
lo normal es reutilizar el mismo proyecto Firebase que respalda Sti-platform,
así ambas apps comparten backend de identidad.

1. Ve a [Firebase Console](https://console.firebase.google.com) → tu proyecto (el de Sti-platform, o uno nuevo)
2. **Authentication → Sign-in method** → habilita el proveedor **Google**
3. **Authentication → Settings → Authorized domains** → agrega:
   - `localhost` (normalmente ya está)
   - `TU_USUARIO.github.io` (producción)
4. **Project Settings → General → Your apps** → registra (o reutiliza) una **Web app** y copia su config
5. Como Firebase corre sobre un proyecto GCP, además hace falta:
   - **APIs & Services → Library** → habilitar **Google Drive API** y **Google Sheets API**
   - **APIs & Services → OAuth consent screen → Scopes** → agregar `.../auth/drive.file` y `.../auth/spreadsheets`
     (son scopes sensibles adicionales — sin esto el login funciona pero subir fotos falla con 401/403)

### 3. Configurar credenciales

```bash
cp .env.example .env
```

Edita `.env` y pega los valores de la Web app de Firebase:
```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

### 4. Restringir acceso (IMPORTANTE)

Si el proyecto GCP detrás de Firebase está en modo **Testing**:
1. Ve a **OAuth consent screen**
2. En **Test users**: agrega SOLO los emails autorizados
3. Cualquier otro email será rechazado por Google

Si ya está en **Production** (app verificada), este paso no aplica.

### 5. Ejecutar en desarrollo

```bash
pnpm dev
```

Abre en el celular: `http://TU_IP_LOCAL:5173/sti-cam/`
(Vite muestra la URL en la terminal)

### 6. Deploy a GitHub Pages

```bash
pnpm deploy
```

Esto ejecuta `vite build` y publica con `gh-pages`.

Tu app estará en: `https://TU_USUARIO.github.io/sti-cam/`

> **Nota:** Asegúrate de que en `vite.config.js` el `base` coincida con el nombre de tu repo.

## Estructura en Google Drive

La app crea automáticamente:

```
📁 Mi Drive/
  📁 STI-Fotos/
    📁 FSFB Bloque B/
      📷 STI_fsfb_2026-04-01T...001.jpg
      📷 STI_fsfb_2026-04-01T...002.jpg
    📁 Compensar - Complejo Acuático/
    📁 Entre Ríos/
    📁 Portal de la Autopista/
```

## Agregar/quitar proyectos

Edita `src/config/projects.js`:

```js
export const PROJECTS = [
  { id: 'nuevo', name: 'Proyecto Nuevo', icon: '🏗️', folderId: null },
  // ...
];
```

## Modo Demo

Si no configuras Firebase, la app funciona en modo demo:
- Login simulado
- Cámara funcional
- Uploads simulados (no se conecta a Drive)

Útil para probar la interfaz antes de configurar Google Cloud.

## Indicador de estado "Drive"

El punto junto a "Drive" en el encabezado muestra el estado de conexión y sesión:

- 🔴 Rojo — sin conexión, sin usuario o sin Firebase configurado
- 🟠 Ámbar — sesión iniciada pero el token expiró (requiere volver a iniciar sesión)
- 🟢 Verde — conectado con sesión válida

## Seguridad

- **Repo privado** en GitHub (GitHub Pages funciona desde repos privados)
- **OAuth restringido** a emails autorizados (Test users en Google Cloud)
- **Scope mínimo**: `drive.file` (solo archivos creados por la app)
- **Tokens temporales**: ~1 hora, solo en memoria del navegador
- **Config de Firebase pública por diseño** (sin secrets en el código, como el Client ID de OAuth antes)

## Tecnologías

- React 18 + Vite
- Firebase Authentication (proveedor Google)
- Google Drive API v3 / Google Sheets API v4
- getUserMedia (cámara custom)
- PWA (installable en home screen)

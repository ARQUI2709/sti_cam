# STI-Cam 📸

Registro fotográfico de obra — fotos directo a Google Drive, sin pasar por Google Photos.

## Arquitectura

```
src/
├── config/           # Configuración (proyectos, Google OAuth)
│   ├── projects.js   # Lista editable de proyectos
│   └── google.js     # Client ID, scopes, carpeta raíz
├── domain/           # Lógica de negocio (pura, sin dependencias externas)
│   ├── Photo.js      # Entidad: foto capturada
│   └── UploadManager.js  # Servicio: cola de subida con concurrencia
├── infrastructure/   # Adaptadores a servicios externos
│   ├── GoogleAuth.js     # OAuth 2.0 con Google Identity Services
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

### 2. Configurar Google Cloud (10 min)

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un proyecto nuevo: `STI-Cam`
3. Ve a **APIs & Services → Library**
4. Busca y habilita: **Google Drive API**
5. Ve a **APIs & Services → Credentials**
6. Click **Create Credentials → OAuth 2.0 Client ID**
7. Tipo: **Web Application**
8. Nombre: `STI-Cam`
9. **Authorized JavaScript origins:**
   - `http://localhost:5173` (desarrollo)
   - `https://TU_USUARIO.github.io` (producción)
10. Copia el **Client ID**

### 3. Configurar credenciales

```bash
cp .env.example .env
```

Edita `.env` y pega tu Client ID:
```
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

### 4. Restringir acceso (IMPORTANTE)

En Google Cloud Console:
1. Ve a **OAuth consent screen**
2. Modo: **External** → **Testing**
3. En **Test users**: agrega SOLO los emails autorizados
4. Cualquier otro email será rechazado por Google

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

Si no configuras el Client ID, la app funciona en modo demo:
- Login simulado
- Cámara funcional
- Uploads simulados (no se conecta a Drive)

Útil para probar la interfaz antes de configurar Google Cloud.

## Indicador de estado "Drive"

El punto junto a "Drive" en el encabezado muestra el estado de conexión y sesión:

- 🔴 Rojo — sin conexión, sin usuario o sin Client ID
- 🟠 Ámbar — sesión iniciada pero el token expiró (requiere volver a iniciar sesión)
- 🟢 Verde — conectado con sesión válida

## Seguridad

- **Repo privado** en GitHub (GitHub Pages funciona desde repos privados)
- **OAuth restringido** a emails autorizados (Test users en Google Cloud)
- **Scope mínimo**: `drive.file` (solo archivos creados por la app)
- **Tokens temporales**: ~1 hora, solo en memoria del navegador
- **Client ID público por diseño** (sin secrets en el código)

## Tecnologías

- React 18 + Vite
- Google Identity Services (OAuth 2.0)
- Google Drive API v3
- getUserMedia (cámara custom)
- PWA (installable en home screen)

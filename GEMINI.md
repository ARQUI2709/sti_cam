# GEMINI.md

This file provides context, architecture guidelines, and code structure for the Gemini assistant when working on this repository.

## Project Overview

**STI Cam** is a Progressive Web App (PWA) developed with React 18 and Vite, aimed at photographic documentation of construction sites. Photos taken through the app are uploaded directly to Google Drive, and each capture is logged in a Google Sheets spreadsheet.

## Architecture and Code Structure

The application's structure is divided into distinct functional layers, centralized in the `sti-cam/src/` directory:

```text
src/
├── config/           # General configurations (projects, OAuth, etc.)
├── domain/           # Core business logic without external dependencies (entities, upload logic)
├── infrastructure/   # Integration with external services (Google Auth, Drive & Sheets APIs, Camera access)
├── hooks/            # React hooks connecting the presentation to the infrastructure/domain layers
├── screens/          # Main application screens (AuthScreen, HomeScreen, CameraScreen)
├── components/       # Modular and reusable UI components
├── styles/           # Visual constants, color palettes, and themes
├── App.jsx           # Main component responsible for routing and detecting offline/online network state
└── main.jsx          # Main entry point
```

## Main Commands

All commands are executed from the `sti-cam/` directory:

```bash
npm run dev       # Starts development server (accessible from local network)
npm run build     # Generates the production build
npm run preview   # Previews the production build
npm run deploy    # Automatically publishes to GitHub Pages (requires prior setup)
```

## Key Data Flows

1. **Offline First Handling**: When a photo is taken, it is immediately saved as an ArrayBuffer in IndexedDB to prevent data loss if the connection is lost. `App.jsx` monitors the connection state to automatically restart queues.
2. **Upload and Logging**: Once the image is captured via `CameraService`, `UploadManager.js` handles concurrent uploads to Google Drive, managing potential retries. After the file is uploaded, it updates a Google Sheets spreadsheet with the log data.
3. **Authentication (GIS)**: `GoogleAuth.js` handles authentication without using a classic redirect flow, keeping a Google token in `localStorage` (`sti-cam-auth`). Silent or forced reconnection is handled to ensure access to the secure offline environment.

## Development Guidelines

1. **Preserve Architecture**: Maintain the strict separation of layers (Presentation → Hooks → Domain → Infrastructure).
2. **PWA Compatibility**: When making changes to file storage or manipulation (like Blobs or ArrayBuffers), always remember specific iOS compatibility as a PWA.
3. **Reuse Components**: Rely on pre-existing UI components and styles from `theme.js` to maintain a clean and consistent appearance.
4. **Development Mode**: Avoid exposing sensitive environment variables in the code, especially secrets, although `VITE_GOOGLE_CLIENT_ID` is public by design and necessary for frontend requests.

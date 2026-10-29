import { useRef, useCallback } from 'react';
import { UploadManager } from '../domain/UploadManager';
import { uploadFile, getProjectFolderId } from '../infrastructure/GoogleDrive';
import { getOrCreateSheet, appendPhotoRow } from '../infrastructure/GoogleSheets';
import { getProject } from '../config/projects';
import { GOOGLE_CLIENT_ID } from '../config/google';
import { saveToQueue, removeFromQueue } from '../infrastructure/OfflineQueue';
import { logger } from '../infrastructure/Logger';

/**
 * Hook que conecta el UploadManager con Google Drive.
 */
export function useUploadQueue({ updateQueueItem }) {
  const managerRef = useRef(null);
  const folderCacheRef = useRef(new Map());

  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new UploadManager({
        driveService: { uploadFile },
        sheetsService: { getOrCreateSheet, appendPhotoRow },
        onUpdate: (id, updates) => {
          updateQueueItem(id, updates);
          // Remove from IDB once the upload is settled (success or permanent error)
          if (updates.status === 'done' || updates.status === 'error') {
            removeFromQueue(id).catch(() => {});
          }
        },
      });
    }
    return managerRef.current;
  }, [updateQueueItem]);

  /**
   * Encola una foto para subir.
   * Persists to IndexedDB first so it survives app close.
   * If Google isn't configured, simulates the upload (demo mode).
   */
  const enqueueUpload = useCallback(async (photo) => {
    const isConfigured = !!GOOGLE_CLIENT_ID;

    if (!isConfigured) {
      // Modo demo: simular upload
      updateQueueItem(photo.id, { status: 'uploading', progress: 10 });
      let p = 10;
      const interval = setInterval(() => {
        p += Math.random() * 20 + 10;
        if (p >= 100) {
          clearInterval(interval);
          updateQueueItem(photo.id, { status: 'done', progress: 100 });
        } else {
          updateQueueItem(photo.id, { progress: Math.round(p) });
        }
      }, 400);
      return;
    }

    // Persist to IndexedDB before attempting upload (non-fatal if IDB unavailable)
    try { await saveToQueue(photo); } catch (_) {}

    // Check if we're offline — don't even attempt Drive API calls
    if (!navigator.onLine) {
      logger.log(`[queue] offline — saved ${photo.fileName} to IDB, skipping upload`);
      updateQueueItem(photo.id, { status: 'offline', error: 'Sin conexión' });
      return;
    }

    // Producción: obtener/crear carpeta y subir
    try {
      const project = getProject(photo.projectId);
      let folderId = folderCacheRef.current.get(photo.projectId);

      if (!folderId) {
        logger.log(`[queue] resolving folder for project ${project.name}`);
        folderId = await getProjectFolderId(project.name);
        folderCacheRef.current.set(photo.projectId, folderId);
      }

      logger.log(`[queue] enqueuing ${photo.fileName} → folder ${folderId}`);
      getManager().enqueue(photo, folderId, project.name);
    } catch (err) {
      logger.warn(`[queue] enqueue failed for ${photo.fileName}:`, err.message);
      // Network or auth error — leave in IDB, mark as offline in UI
      updateQueueItem(photo.id, { status: 'offline', error: err.message });
    }
  }, [getManager, updateQueueItem]);

  /**
   * Retry a batch of photos loaded from IndexedDB (called on reconnect).
   * Reconstructs the queue item in React state then enqueues the upload.
   */
  const retryOfflineQueue = useCallback(async (photos, addToQueue) => {
    logger.log(`[queue] retryOfflineQueue called with ${photos.length} items`);
    for (const photo of photos) {
      // Restore blob URL for thumbnail display
      const thumbUrl = URL.createObjectURL(photo.blob);
      const queueItem = {
        id: photo.id,
        projectId: photo.projectId,
        name: photo.fileName,
        size: `${(photo.blob.size / 1024 / 1024).toFixed(1)} MB`,
        thumb: thumbUrl,
        status: 'pending',
        progress: 0,
      };
      // addToQueue deduplicates by id — for items already in state (status: 'offline')
      // we need to reset their status so the UI reflects the retry
      addToQueue(queueItem);
      updateQueueItem(photo.id, { status: 'pending', progress: 0, error: undefined });
      await enqueueUpload({
        ...photo,
        thumbUrl,
        createdAt: new Date(photo.createdAt),
      });
    }
    logger.log('[queue] retryOfflineQueue complete');
  }, [enqueueUpload, updateQueueItem]);

  return { enqueueUpload, retryOfflineQueue };
}

/**
 * Infraestructura: Google Sheets API v4
 * Mantiene una hoja por proyecto con columnas:
 *   A: Nombre del archivo
 *   B: Fecha
 *   C: Tamaño
 *   D: =IMAGE(url)  — previsualización en Sheets
 *   E: File ID (oculto, usado para localizar filas al eliminar)
 */

import { getAccessToken } from './GoogleAuth.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API  = 'https://www.googleapis.com/drive/v3';

// Display pattern for the date column (locale-independent: applied as a number format)
const DATE_PATTERN = 'dd/mm/yyyy hh:mm:ss';

// Cache: projectName → spreadsheetId
const sheetCache = new Map();

/**
 * Converts a JS Date (or timestamp) to a Google Sheets serial number so the
 * value is stored as a real date — recognized regardless of the sheet's locale.
 * Sheets serial = days since 1899-12-30, interpreted as wall-clock time.
 * @param {Date|number|string} value
 * @returns {number|string} serial number, or '' if value is falsy/invalid
 */
function toSheetsSerial(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const epoch = Date.UTC(1899, 11, 30);
  // Shift to local wall-clock time so the displayed time matches the capture time
  const local = d.getTime() - d.getTimezoneOffset() * 60000;
  return (local - epoch) / 86400000;
}

/**
 * batchUpdate request that formats column B (the date column) below the header
 * as a date-time. Applied on every write so pre-existing sheets get fixed too.
 */
function dateColumnFormatRequest(sheetId) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
      cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: DATE_PATTERN } } },
      fields: 'userEnteredFormat.numberFormat',
    },
  };
}

async function authHeaders(includeContentType = true, forceConsent = false) {
  const token = await getAccessToken(forceConsent);
  const h = { Authorization: `Bearer ${token}` };
  if (includeContentType) h['Content-Type'] = 'application/json';
  return h;
}

/**
 * Finds an existing Sheet by name inside STI-Fotos, or creates one.
 * The sheet lives alongside the photo folder in Drive.
 * @param {string} projectName
 * @param {string} folderId - Drive folder ID of the project
 * @returns {string} spreadsheetId
 */
export async function getOrCreateSheet(projectName, folderId) {
  if (sheetCache.has(projectName)) return sheetCache.get(projectName);

  const headers = await authHeaders();
  const sheetName = `STI_000_${projectName}`;

  // Search for existing sheet in the project folder
  const q = encodeURIComponent(
    `name='${sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed=false`
  );
  const search = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`, { headers });
  const { files } = await search.json();

  if (files?.length) {
    sheetCache.set(projectName, files[0].id);
    return files[0].id;
  }

  // Create new spreadsheet
  let createRes = await fetch(SHEETS_API, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      properties: { title: sheetName },
      sheets: [{
        properties: { title: 'Fotos', gridProperties: { frozenRowCount: 1 } },
      }],
    }),
  });
  if (createRes.status === 401 || createRes.status === 403) {
    throw new Error(`Sheets API rechazó el token (${createRes.status}): cerrá sesión y volvé a iniciar para otorgar el permiso de Sheets.`);
  }
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(`Sheets create failed (${createRes.status}): ${err?.error?.message || 'check OAuth scopes'}`);
  }
  const sheet = await createRes.json();
  const spreadsheetId = sheet.spreadsheetId;
  if (!spreadsheetId) throw new Error('Sheets API returned no spreadsheetId');

  // Move into the project folder (auth header only, no Content-Type)
  const driveHeaders = await authHeaders(false);
  const fileRes = await fetch(
    `${DRIVE_API}/files/${spreadsheetId}?addParents=${folderId}&removeParents=root&fields=id`,
    { method: 'PATCH', headers: driveHeaders }
  );
  if (!fileRes.ok) {
    const err = await fileRes.json().catch(() => ({}));
    console.warn('Sheet folder move failed:', err?.error?.message);
  }

  // Write header row
  await _writeHeader(spreadsheetId, headers);

  sheetCache.set(projectName, spreadsheetId);
  return spreadsheetId;
}

async function _writeHeader(spreadsheetId, headers) {
  await fetch(`${SHEETS_API}/${spreadsheetId}/values/Fotos!A1:E1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      values: [['Archivo', 'Fecha', 'Tamaño', 'Imagen', 'File ID']],
    }),
  });

  // Bold + freeze header via batchUpdate
  const sheetRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, { headers });
  const { sheets } = await sheetRes.json();
  const sheetId = sheets[0].properties.sheetId;

  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.18, green: 0.31, blue: 0.57 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Clear format on data rows so they don't inherit header style
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: false, foregroundColor: { red: 0, green: 0, blue: 0 } }, backgroundColor: { red: 1, green: 1, blue: 1 } } },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Hide column E (File ID) — set width to 0
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser',
          },
        },
        // Format column B (Fecha) as date-time so it's recognized in any locale
        dateColumnFormatRequest(sheetId),
        // Set row height for image rows
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'ROWS', startIndex: 1 },
            properties: { pixelSize: 180 },
            fields: 'pixelSize',
          },
        },
        // Set column D (image) width
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
            properties: { pixelSize: 180 },
            fields: 'pixelSize',
          },
        },
      ],
    }),
  });
}

/**
 * Appends a photo row to the project sheet.
 * Called after a successful upload.
 */
export async function appendPhotoRow(spreadsheetId, photo) {
  const headers = await authHeaders();
  const imageUrl = `https://drive.google.com/thumbnail?id=${photo.driveFileId}&sz=w400`;
  const date = toSheetsSerial(photo.createdAt);
  const size = photo.sizeLabel || '';

  const appendRes = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Fotos!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        values: [[
          photo.fileName,
          date,
          size,
          `=IMAGE("${imageUrl}")`,
          photo.driveFileId,
        ]],
      }),
    }
  );
  const appendData = await appendRes.json();

  // Set row height on the newly appended row (Sheets doesn't inherit row height)
  const updatedRange = appendData?.updates?.updatedRange; // e.g. "Fotos!A5:E5"
  const rowMatch = updatedRange?.match(/:([A-Z]+)(\d+)$/);
  if (rowMatch) {
    const rowIndex = parseInt(rowMatch[2], 10) - 1; // 0-based
    const sheetRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, { headers });
    const { sheets } = await sheetRes.json();
    const sheetId = sheets[0].properties.sheetId;
    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
              properties: { pixelSize: 180 },
              fields: 'pixelSize',
            },
          },
          dateColumnFormatRequest(sheetId),
        ],
      }),
    });
  }
}

/**
 * Rewrites legacy text date cells in column B as real date serials.
 * Source of truth is each row's Drive file createdTime (matched by File ID in
 * column E), so we never parse locale-specific date strings.
 * @param {string} spreadsheetId
 * @param {Array<Array>} existingRows - unformatted values for Fotos!B2:E
 * @param {Array<{id, createdTime}>} driveFiles
 * @param {object} headers
 */
async function _backfillDateColumn(spreadsheetId, existingRows, driveFiles, headers) {
  if (!existingRows.length) return;
  const createdById = new Map(driveFiles.map((f) => [f.id, f.createdTime]));

  let changed = false;
  const bColumn = existingRows.map((row) => {
    const current = row?.[0];
    // Already a numeric serial → leave it untouched.
    if (typeof current === 'number') return [current];
    const fileId = row?.[3];
    const createdTime = createdById.get(fileId);
    if (createdTime) {
      const serial = toSheetsSerial(createdTime);
      if (serial !== '') {
        changed = true;
        return [serial];
      }
    }
    // No reliable source — keep whatever is there.
    return [current ?? ''];
  });

  if (!changed) return;

  const endRow = bColumn.length + 1; // data starts at row 2
  await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Fotos!B2:B${endRow}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', headers, body: JSON.stringify({ values: bColumn }) }
  );

  // Ensure the column carries the date-time format (older sheets may lack it).
  const sheetRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, { headers });
  const { sheets } = await sheetRes.json();
  const sheetId = sheets[0].properties.sheetId;
  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requests: [dateColumnFormatRequest(sheetId)] }),
  });
}

/**
 * Syncs the sheet with the current Drive folder contents.
 * Reads column E (File IDs already in the sheet) and appends rows for any
 * Drive files that are not yet registered — backfills photos uploaded before
 * the sheet existed.
 * @param {string} spreadsheetId
 * @param {Array<{id, name, createdTime, size}>} driveFiles - from listFiles()
 */
export async function syncSheetFromDrive(spreadsheetId, driveFiles) {
  if (!driveFiles?.length) return;
  const headers = await authHeaders();

  // Read existing date (B) + file ID (E) columns, unformatted so numeric serials
  // come back as numbers (lets us skip rows already migrated).
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Fotos!B2:E?valueRenderOption=UNFORMATTED_VALUE`,
    { headers }
  );
  const { values: existingRows = [] } = await res.json();
  const existingIds = new Set(existingRows.map((r) => r?.[3]).filter(Boolean));

  // Backfill: rewrite any text/legacy date cells as real date serials, sourced
  // from the matching Drive file's createdTime. Runs on every sync by default.
  await _backfillDateColumn(spreadsheetId, existingRows, driveFiles, headers);

  const missing = driveFiles.filter((f) => !existingIds.has(f.id));
  if (!missing.length) return;

  const rows = missing.map((f) => {
    const imageUrl = `https://drive.google.com/thumbnail?id=${f.id}&sz=w400`;
    const date = toSheetsSerial(f.createdTime);
    const size = f.size ? `${(parseInt(f.size, 10) / 1024).toFixed(0)} KB` : '';
    return [f.name, date, size, `=IMAGE("${imageUrl}")`, f.id];
  });

  const appendRes = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/Fotos!A:E:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ values: rows }),
    }
  );
  const appendData = await appendRes.json();

  // Apply 180px row height to all inserted rows
  const updatedRange = appendData?.updates?.updatedRange; // e.g. "Fotos!A2:E10"
  const rangeMatch = updatedRange?.match(/(\d+):([A-Z]+)(\d+)$/);
  if (rangeMatch) {
    const startRow = parseInt(rangeMatch[1], 10) - 1; // 0-based
    const endRow = parseInt(rangeMatch[3], 10);       // exclusive
    const sheetRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, { headers });
    const { sheets } = await sheetRes.json();
    const sheetId = sheets[0].properties.sheetId;
    await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        requests: [
          {
            updateDimensionProperties: {
              range: { sheetId, dimension: 'ROWS', startIndex: startRow, endIndex: endRow },
              properties: { pixelSize: 180 },
              fields: 'pixelSize',
            },
          },
          dateColumnFormatRequest(sheetId),
        ],
      }),
    });
  }
}

/**
 * Removes a photo row from the sheet by matching the Drive file ID in column E.
 * @param {string} spreadsheetId
 * @param {string} driveFileId
 */
export async function removePhotoRow(spreadsheetId, driveFileId) {
  const headers = await authHeaders();

  // Read all file IDs from column E
  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values/Fotos!E:E`, { headers });
  const { values = [] } = await res.json();

  const rowIndex = values.findIndex((row) => row[0] === driveFileId);
  if (rowIndex < 1) return; // not found or header row

  // Get sheetId
  const sheetRes = await fetch(`${SHEETS_API}/${spreadsheetId}?fields=sheets.properties`, { headers });
  const { sheets } = await sheetRes.json();
  const sheetId = sheets[0].properties.sheetId;

  await fetch(`${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
        },
      }],
    }),
  });
}

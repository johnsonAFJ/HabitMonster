// Saves the save file in this browser's localStorage, plus JSON export and import.
// localStorage is per address: localhost:8438, the published site and the
// home-screen app each keep their own garden. Export and import move it.

import { emptyGarden, validateGarden } from './garden.js';

const KEY = 'habit-monster';

export function loadGarden() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptyGarden();
  try {
    return validateGarden(JSON.parse(raw));
  } catch (err) {
    // Keep the unreadable copy so a bad save never silently wipes history.
    localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    console.error('Saved garden was unreadable. A copy was kept in localStorage.', err);
    return emptyGarden();
  }
}

export function saveGarden(garden) {
  localStorage.setItem(KEY, JSON.stringify(garden));
}

// Saves a backup file. The home-screen app on a phone can't download files,
// so there it opens the share sheet instead ("Save to Files", AirDrop, email).
// Returns false if the person cancels the share sheet.
export async function saveBackup(garden, today) {
  const name = `habit-monster-${today}.json`;
  const json = JSON.stringify(garden, null, 2);
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const file = new File([json], name, { type: 'application/json' });
  if (installed && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch {
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export async function readBackup(file) {
  return validateGarden(JSON.parse(await file.text()));
}

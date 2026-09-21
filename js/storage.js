// Saves the game in this browser's localStorage, plus JSON export and import.
// localStorage is per address: localhost:8438, the published site and the
// home-screen app each keep their own save. Export and import move it.

import { emptySave, validateSave } from './monster.js';

const KEY = 'habit-monster';

export function readSave() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return emptySave();
  try {
    return validateSave(JSON.parse(raw));
  } catch (err) {
    // Keep the unreadable copy so a bad save never silently wipes history.
    localStorage.setItem(`${KEY}-unreadable-${Date.now()}`, raw);
    console.error('The saved game was unreadable. A copy was kept in localStorage.', err);
    return emptySave();
  }
}

export function writeSave(save) {
  localStorage.setItem(KEY, JSON.stringify(save));
}

// Saves a backup file. The home-screen app on a phone can't download files,
// so there it opens the share sheet instead ("Save to Files", AirDrop, email).
// Returns false if the person cancels the share sheet.
export async function saveBackup(save, today) {
  const name = `habit-monster-${today}.json`;
  const json = JSON.stringify(save, null, 2);
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
  return validateSave(JSON.parse(await file.text()));
}

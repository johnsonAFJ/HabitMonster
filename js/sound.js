// Sound effects and optional background music, with one mute for both.
//
// Files live in assets/audio/. A missing file is simply silence: nothing
// throws, nothing logs, and the rest of the app carries on. That keeps the
// app working before the audio lands, and if a file ever fails to download.
//
// To rename or add a sound, edit EFFECTS. Nothing else needs to change.

const KEY = 'habit-monster-muted';
const DIR = 'assets/audio';

export const EFFECTS = {
  log: 'log.mp3',        // a habit is logged
  hatch: 'hatch.mp3',    // the egg opens
  levelUp: 'level-up.mp3',
  evolve: 'evolve.mp3',
};

export const MUSIC = 'theme.mp3';

const EFFECT_VOLUME = 0.6;
const MUSIC_VOLUME = 0.3;

let muted = readMuted();
let music = null;
let unlocked = false;
const sources = new Map();

function readMuted() {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    // Private browsing can block storage. Sound on for this visit is fine.
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem(KEY, String(muted));
  } catch {
    // Still takes effect for this visit if storage is blocked.
  }
  if (!music) return;
  if (muted) music.pause();
  else music.play().catch(() => {});
}

function source(file) {
  if (!sources.has(file)) {
    const audio = new Audio(`${DIR}/${file}`);
    audio.preload = 'auto';
    audio.volume = EFFECT_VOLUME;
    sources.set(file, audio);
  }
  return sources.get(file);
}

export function play(name) {
  if (muted || !unlocked) return;
  const file = EFFECTS[name];
  if (!file) return;
  // Cloning lets a sound overlap itself and restart instantly, instead of
  // being ignored because the one element is already playing.
  const node = source(file).cloneNode();
  node.volume = EFFECT_VOLUME;
  node.play().catch(() => {});
}

// Phones refuse to play anything until the person has interacted with the
// page, so the first tap is what actually starts the audio. Calling this
// again later is harmless.
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (!music) {
    music = new Audio(`${DIR}/${MUSIC}`);
    music.loop = true;
    music.volume = MUSIC_VOLUME;
  }
  if (!muted) music.play().catch(() => {});
}

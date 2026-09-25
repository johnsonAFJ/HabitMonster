// Sound effects and looping music, with one mute for both.
//
// Built on the Web Audio API rather than <audio> elements, for two reasons:
// decoded buffers loop sample-accurately, where AAC played through an <audio>
// element leaves an audible gap at the seam from its encoder padding; and the
// same sound can overlap itself without cloning nodes.
//
// Files live in assets/audio/ as .m4a, encoded from the .wav masters beside
// them (6.1 MB of WAV compresses to 1.2 MB, which matters because the service
// worker caches all of it for offline use).
//
// A missing or unplayable file is silence. Nothing throws and nothing logs,
// so the app works whether or not the audio is there.

const KEY = 'habit-monster-muted';
const DIR = 'assets/audio';

export const EFFECTS = {
  tap: 'ui_tap.m4a',
  confirm: 'ui_confirm.m4a',
  cancel: 'ui_cancel.m4a',
  error: 'ui_error.m4a',
  log: 'habit_complete.m4a',
  eat: 'monster_eat_apple.m4a',
  levelUp: 'level_up.m4a',
  evolve1: 'evolve_form1_to_2.m4a',
  evolve2: 'evolve_form2_to_3.m4a',
  coin: 'coin.m4a',      // a new piece of furniture arrives
};

export const MUSIC = {
  title: 'music_title_loop.m4a',
  room: 'music_room_loop.m4a',
};

const EFFECT_VOLUME = 0.7;
const MUSIC_VOLUME = 0.25;

let ctx = null;
let master = null;
let muted = readMuted();
let track = null;
let musicSource = null;
let musicToken = 0;
const buffers = new Map();

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

function decode(file) {
  if (!buffers.has(file)) {
    buffers.set(file, fetch(`${DIR}/${file}`)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(file))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null));
  }
  return buffers.get(file);
}

export async function play(name) {
  if (muted || !ctx) return;
  const file = EFFECTS[name];
  if (!file) return;
  const buffer = await decode(file);
  if (!buffer || muted) return;
  const gain = ctx.createGain();
  gain.gain.value = EFFECT_VOLUME;
  gain.connect(master);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start();
}

function stopMusic() {
  if (!musicSource) return;
  try {
    musicSource.stop();
  } catch {
    // Already stopped.
  }
  musicSource = null;
}

async function startMusic() {
  const token = ++musicToken;
  stopMusic();
  if (muted || !ctx || !track) return;
  const buffer = await decode(MUSIC[track]);
  // The track can change, or be muted, while the file is still decoding.
  if (!buffer || token !== musicToken || muted) return;
  const gain = ctx.createGain();
  gain.gain.value = MUSIC_VOLUME;
  gain.connect(master);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start();
  musicSource = source;
}

// Which loop should be playing: 'title' on the picker, 'room' in the game.
export function setMusic(next) {
  if (next === track) return;
  track = next;
  startMusic();
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem(KEY, String(muted));
  } catch {
    // Still takes effect for this visit if storage is blocked.
  }
  if (muted) stopMusic();
  else startMusic();
}

// Phones refuse to play audio until the person has interacted with the page,
// so the first tap is what actually starts it. Calling this again is harmless.
export function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  ctx = new Context();
  master = ctx.createGain();
  master.connect(ctx.destination);
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  startMusic();
}

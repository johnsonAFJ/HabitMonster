// The territory game on screen: drawing, controls, the countdown, pausing,
// and the round's end. The rules live in game.js; this file only turns them
// into pixels and turns his taps into steering.
//
// The rules tick 7 times a second, on whole cells. Drawing runs every frame
// and slides each monster between the cell it was on and the one it is on
// now, so movement is smooth even though the game underneath is a grid.

import {
  createGame, steer, step, shareOf, SIZE, TICKS_PER_SECOND, UP, RIGHT, DOWN, LEFT,
} from './game.js';
import { STARTERS } from './monster.js';
import { hasFrame, CELL as SHEET_CELL, COL_NORMAL, COL_WALK_A, COL_WALK_B } from './art.js';
import { play, setMusic } from './sound.js';

const CELL = 12;
const BOARD = SIZE * CELL;
const TICK_MS = 1000 / TICKS_PER_SECOND;
// Half the sheet's 64 px, which is a clean reduction for pixel art. It covers
// about two and a half cells: big enough to tell monsters apart at a glance.
const SPRITE = SHEET_CELL / 2;
const COUNT_MS = 650;
const BANNER_MS = 1600;
const GUIDE_KEY = 'habit-monster-game-guide-seen';

// One colour per creature, matched to its art: solid for land, paler for the
// line it is dragging.
const COLOURS = {
  embertail: { land: '#e0793b', line: '#f6bd8f' },
  voltectra: { land: '#d6a53a', line: '#f1d791' },
  bubbletide: { land: '#4ea888', line: '#a7dcc6' },
};
const FLOOR = '#f4e7cd';
const GRID = '#ecdcbc';

const KEYS = {
  ArrowUp: UP, ArrowRight: RIGHT, ArrowDown: DOWN, ArrowLeft: LEFT,
  w: UP, d: RIGHT, s: DOWN, a: LEFT, W: UP, D: RIGHT, S: DOWN, A: LEFT,
};

// getArt is a function because the art finishes loading after the page does.
// canStart is asked before every round, "play again" included: the lock is
// checked whenever a round starts, so midnight never ends one halfway.
export function createArena({ getArt, canStart, onScore, onExit }) {
  const root = document.getElementById('arena');
  const canvas = document.getElementById('arena-canvas');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('arena-overlay');
  const banner = document.getElementById('arena-banner');
  const scoreLine = document.getElementById('arena-score');
  const pauseButton = document.getElementById('arena-pause');

  canvas.width = BOARD;
  canvas.height = BOARD;

  let state = null;
  let player = null; // { species, form }
  let phase = 'closed'; // closed | guide | countdown | playing | paused | over
  let last = 0;
  let pending = 0;
  let previous = [];
  let countFrom = 0;
  let bannerUntil = 0;
  let raf = 0;

  // ---- Drawing ----

  function drawCell(c, colour) {
    ctx.fillStyle = colour;
    ctx.fillRect((c % SIZE) * CELL, Math.floor(c / SIZE) * CELL, CELL, CELL);
  }

  function drawBoard() {
    ctx.fillStyle = FLOOR;
    ctx.fillRect(0, 0, BOARD, BOARD);
    // A faint grid, so the cells he is claiming are easy to see.
    ctx.fillStyle = GRID;
    for (let i = 1; i < SIZE; i++) {
      ctx.fillRect(i * CELL, 0, 1, BOARD);
      ctx.fillRect(0, i * CELL, BOARD, 1);
    }
    const species = state.players.map((p) => p.species);
    for (let c = 0; c < SIZE * SIZE; c++) {
      const owner = state.owner[c];
      if (owner) drawCell(c, COLOURS[species[owner - 1]].land);
    }
    // Lines over land. A cell several lines cross shows the first of them;
    // the rules treat it as all of theirs either way.
    for (let c = 0; c < SIZE * SIZE; c++) {
      const lines = state.trail[c];
      if (!lines) continue;
      const first = Math.log2(lines & -lines);
      drawCell(c, COLOURS[species[first]].line);
    }
  }

  function drawMonster(p, fraction) {
    const sheet = getArt()?.sheets?.[p.species];
    if (!sheet) return;
    // Slide from the cell it was on to the one it is on now. A monster that
    // has just come back, or was standing at a wall, simply sits on its cell.
    const from = previous[p.index];
    const sliding = from && from.alive && (from.x !== p.x || from.y !== p.y);
    const x = sliding ? from.x + (p.x - from.x) * fraction : p.x;
    const y = sliding ? from.y + (p.y - from.y) * fraction : p.y;

    // Rivals are always hatchlings, so their evolutions are not spoiled before
    // they arrive in the backpack. His monster is whatever form it is now.
    const form = p.human ? player.form : 0;
    let column = COL_NORMAL;
    if (p.human && sliding && hasFrame(getArt(), p.species, COL_WALK_B)) {
      column = state.tick % 2 ? COL_WALK_B : COL_WALK_A;
    }

    // Feet on the bottom of its cell, so it reads as standing there.
    const left = Math.round((x + 0.5) * CELL - SPRITE / 2);
    const top = Math.round((y + 1) * CELL - SPRITE);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (p.dir === LEFT) {
      ctx.translate(left * 2 + SPRITE, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(sheet, column * SHEET_CELL, form * SHEET_CELL, SHEET_CELL, SHEET_CELL, left, top, SPRITE, SPRITE);
    ctx.restore();
  }

  function draw(now) {
    if (!state) return;
    drawBoard();
    const fraction = phase === 'playing' ? Math.min(1, pending / TICK_MS) : 1;
    // Draw lower monsters last, so whoever is nearer the bottom is in front.
    const alive = state.players.filter((p) => p.alive).sort((a, b) => a.y - b.y);
    for (const p of alive) drawMonster(p, fraction);
    scoreLine.textContent = `${Math.round(shareOf(state, 0))}%`;
    banner.classList.toggle('shown', now < bannerUntil);
    if (phase === 'countdown') drawCountdown(now);
  }

  // ---- The round ----

  function rivalsFor(species) {
    return STARTERS.filter((s) => s !== species).map((s) => ({ species: s }));
  }

  function newRound() {
    // A fresh seed every round. Writing it down is enough to replay one.
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    state = createGame({ seed, player: { species: player.species }, rivals: rivalsFor(player.species) });
    previous = state.players.map((p) => ({ x: p.x, y: p.y, alive: p.alive }));
    pending = 0;
    bannerUntil = 0;
  }

  function showOverlay(html, onTap) {
    overlay.innerHTML = html;
    overlay.hidden = false;
    overlay.onclick = onTap ?? null;
  }

  function hideOverlay() {
    overlay.hidden = true;
    overlay.onclick = null;
    overlay.innerHTML = '';
  }

  function startCountdown() {
    phase = 'countdown';
    countFrom = performance.now();
    hideOverlay();
    play('tap');
  }

  let lastCount = 3;
  function drawCountdown(now) {
    const elapsed = now - countFrom;
    const n = 3 - Math.floor(elapsed / COUNT_MS);
    if (n !== lastCount && n >= 1) play('tap');
    lastCount = n;
    if (n <= 0) {
      phase = 'playing';
      last = now;
      lastCount = 3;
      play('confirm');
      return;
    }
    ctx.fillStyle = 'rgba(43, 34, 32, 0.35)';
    ctx.fillRect(0, 0, BOARD, BOARD);
    ctx.fillStyle = '#fffaf0';
    ctx.font = 'bold 96px "Pixelify Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), BOARD / 2, BOARD / 2);
  }

  function guideOrCountdown() {
    let seen = false;
    try {
      seen = localStorage.getItem(GUIDE_KEY) === 'true';
    } catch {
      // Storage blocked: show the guide, which is harmless.
    }
    if (seen) {
      startCountdown();
      return;
    }
    phase = 'guide';
    showOverlay(`
      <div class="card-overlay">
        <h3>How to play</h3>
        <p>Go out from your land, come back, and keep everything inside the loop.</p>
        <p><b>Don't let anyone touch your line</b> — not even you.</p>
        <p>Touch someone else's line and they're out.</p>
        <button type="button" id="guide-ok">Got it</button>
      </div>`);
    document.getElementById('guide-ok').onclick = (event) => {
      event.stopPropagation();
      try {
        localStorage.setItem(GUIDE_KEY, 'true');
      } catch {
        // It will just show again next time.
      }
      startCountdown();
    };
  }

  function finish() {
    phase = 'over';
    const held = Math.round(state.best * 10) / 10;
    const best = onScore(held);
    showOverlay(`
      <div class="card-overlay">
        <h3>Caught!</h3>
        <p class="big-score">${Math.round(held)}%</p>
        <p>of the board, at your biggest.</p>
        <p class="muted">${held >= best ? 'Your best ever!' : `Your best: ${Math.round(best)}%`}</p>
        <div class="overlay-buttons">
          <button type="button" id="again">Play again</button>
          <button type="button" class="ghost" id="leave">Back</button>
        </div>
      </div>`);
    document.getElementById('again').onclick = (event) => {
      event.stopPropagation();
      if (!canStart()) {
        close();
        return;
      }
      newRound();
      startCountdown();
    };
    document.getElementById('leave').onclick = (event) => {
      event.stopPropagation();
      close();
    };
  }

  function handle(events) {
    for (const e of events) {
      if (e.type === 'claim' && e.player === 0) play('coin');
      if (e.type === 'out' && e.player !== 0 && e.by === 0) play('confirm');
      if (e.type === 'milestone') {
        banner.textContent = `${e.percent}% of the board!`;
        bannerUntil = performance.now() + BANNER_MS;
        play('levelUp');
      }
      if (e.type === 'out' && e.player === 0) play('cancel');
    }
    if (state.over) finish();
  }

  // ---- The loop ----

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (phase === 'playing') {
      // A dropped frame or two catches up; anything longer is ignored, so
      // a stall can never fast-forward him into a rival.
      pending += Math.min(now - last, TICK_MS * 3);
      last = now;
      while (pending >= TICK_MS && phase === 'playing') {
        previous = state.players.map((p) => ({ x: p.x, y: p.y, alive: p.alive }));
        handle(step(state));
        pending -= TICK_MS;
      }
    } else {
      last = now;
    }
    draw(now);
  }

  // ---- Controls ----

  function turn(dir) {
    if (phase === 'playing' || phase === 'countdown') steer(state, dir);
  }

  for (const button of root.querySelectorAll('[data-dir]')) {
    // pointerdown rather than click: click waits to rule out a double-tap,
    // which is far too slow for steering.
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      turn(Number(button.dataset.dir));
    });
  }

  function onKey(event) {
    if (phase === 'closed') return;
    if (event.key in KEYS) {
      event.preventDefault();
      turn(KEYS[event.key]);
    } else if (event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      if (phase === 'playing') pause();
      else if (phase === 'paused') resume();
    }
  }
  document.addEventListener('keydown', onKey);

  // ---- Pausing ----

  function pause() {
    if (phase !== 'playing') return;
    phase = 'paused';
    showOverlay('<div class="card-overlay tap"><h3>Paused</h3><p>Tap to keep going</p></div>', resume);
  }

  function resume() {
    if (phase !== 'paused') return;
    // Back through the countdown, so he has a moment to find his monster.
    startCountdown();
  }

  pauseButton.onclick = () => (phase === 'paused' ? resume() : pause());

  // Leaving the app pauses the round; it does not play on without him.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') pause();
  });
  window.addEventListener('blur', pause);

  // ---- Opening and closing ----

  function open(who) {
    player = who;
    root.hidden = false;
    setMusic('title');
    newRound();
    if (!raf) raf = requestAnimationFrame(frame);
    guideOrCountdown();
  }

  function close() {
    phase = 'closed';
    root.hidden = true;
    hideOverlay();
    cancelAnimationFrame(raf);
    raf = 0;
    state = null;
    onExit();
  }

  document.getElementById('arena-back').onclick = close;

  return { open, close, isOpen: () => phase !== 'closed' };
}

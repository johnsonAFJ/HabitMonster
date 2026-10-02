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
import { STARTERS, STARTER_LABELS } from './monster.js';
import { hasFrame, CELL as SHEET_CELL, COL_NORMAL, COL_WALK_A, COL_WALK_B } from './art.js';
import { play, setMusic } from './sound.js';

const CELL = 12;
const BOARD = SIZE * CELL;
const TICK_MS = 1000 / TICKS_PER_SECOND;
// Half the sheet's 64 px, which is a clean reduction for pixel art. It covers
// about two and a half cells: big enough to tell monsters apart at a glance.
const SPRITE = SHEET_CELL / 2;
const COUNT_MS = 650;
// How much of a tick the slide between cells takes. Sliding over the whole
// tick drew every monster up to a cell behind where the rules had it, and
// half a cell behind on average, so he turned where the picture showed room
// and clipped his own line from where he really was. Catching up in the
// first third keeps the movement smooth and the picture honest.
const SLIDE_PART = 0.33;
const BANNER_MS = 1600;
const GUIDE_KEY = 'habit-monster-game-guide-seen';
// How far a finger has to travel, in screen pixels, before it counts as a
// direction. Small enough to feel instant, big enough that a wobble while
// holding still does not steer.
const DRAG_STEP = 14;

// One colour per creature, matched to its art. Lines are DARKER than land.
// They started paler, the way Paper.io draws them, but that only works on a
// dark board: on this cream one they measured 1.2 to 1.4 : 1 against the
// floor, so his own tail was close to invisible and getting caught by a
// rival crossing it looked random. These are 5.1 to 6.2 : 1 against the
// floor and still clearly different from each monster's own land.
const COLOURS = {
  embertail: { land: '#e0793b', line: '#9c3a17' },
  voltectra: { land: '#d6a53a', line: '#7d5a0c' },
  bubbletide: { land: '#4ea888', line: '#1c5f49' },
};
// Seconds as a game clock: 1:42, or 0:48.
const clock = (seconds) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
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
  let caught = null; // the event that ended the round, to say why
  let won = null; // set when the round ended in a win

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
    const along = Math.min(1, fraction / SLIDE_PART);
    const x = sliding ? from.x + (p.x - from.x) * along : p.x;
    const y = sliding ? from.y + (p.y - from.y) * along : p.y;

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
    caught = null;
    won = null;
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
        <p><b>Drag your finger the way you want to go</b>, or tap where you want to head.</p>
        <p>Go out from your land, come back, and keep everything inside the loop.</p>
        <p><b>Don't let anyone touch your line.</b> You can cross it yourself.</p>
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

  // Why the round ended, in words. Getting caught with no idea how was the
  // worst part of losing, and half the time it was a rival taking every
  // cell he had, which needs no touching at all.
  function why(event) {
    const who = event?.by != null ? STARTER_LABELS[state.players[event.by].species] : null;
    if (event?.cause === 'line' && who) return `${who} crossed your line.`;
    if (event?.cause === 'land' && who) return `${who} took all your land.`;
    if (event?.cause === 'land') return 'All your land was taken.';
    return '';
  }

  // The all-time line: his fastest win once he has one, since a best of 100%
  // stops meaning much; until then, his best share of the board.
  function recordLine(records, seconds) {
    if (records.fastestWin === null) return `<p class="muted">Your best ever: ${Math.round(records.best)}%</p>`;
    if (seconds !== null && seconds <= records.fastestWin) return '<p class="muted"><b>Your fastest win ever!</b></p>';
    return `<p class="muted">Fastest win: ${clock(records.fastestWin)}</p>`;
  }

  function finish() {
    phase = 'over';
    const held = Math.round(state.best * 10) / 10;
    // Seconds of play: the clock only ticks while he is playing, so pauses
    // and the countdown do not count against him.
    const seconds = won ? Math.round((state.tick / TICKS_PER_SECOND) * 10) / 10 : null;
    const records = onScore({ percent: held, seconds });
    const title = won ? 'You won!' : 'Caught!';
    const reason = won
      ? won.reason === 'board'
        ? 'You took the whole board!'
        : 'Nobody has anywhere left to come back. The board is yours!'
      : why(caught);
    showOverlay(`
      <div class="card-overlay${won ? ' win' : ''}">
        <h3>${title}</h3>
        <p class="why">${reason}</p>
        <p class="big-score">${Math.round(held)}%</p>
        <p>of the board, at your biggest.</p>
        ${seconds === null ? '' : `<p class="win-time">in ${clock(seconds)}</p>`}
        <p class="muted">${held >= records.today ? 'Best today!' : `Today's best: ${Math.round(records.today)}%`}</p>
        ${recordLine(records, seconds)}
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
      if (e.type === 'out' && e.player === 0) {
        caught = e;
        play('cancel');
      }
      if (e.type === 'win') {
        won = e;
        // The biggest fanfare there is, the one from the final evolution.
        play('evolve2');
      }
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

  // Steering by touch, the way Paper.io does it: put a finger anywhere on
  // the board and move it the way you want to go. Holding on keeps steering,
  // like a joystick you can put your thumb down anywhere. A tap without
  // moving heads for the spot tapped instead. The board blocks scrolling
  // (touch-action: none), so none of this fights the page.
  let drag = null;

  canvas.addEventListener('pointerdown', (event) => {
    if (phase !== 'playing' && phase !== 'countdown') return;
    event.preventDefault();
    drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_STEP) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
    // Measure from here next time, so the next bend of the finger is a fresh
    // direction rather than an average of the whole drag.
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved = true;
  });

  function endDrag(event) {
    if (!drag) return;
    const wasTap = !drag.moved &&
      Math.max(Math.abs(event.clientX - drag.startX), Math.abs(event.clientY - drag.startY)) < DRAG_STEP;
    drag = null;
    if (!wasTap || !state) return;
    // Head for the tapped spot: whichever way it lies furthest from him.
    const box = canvas.getBoundingClientRect();
    const scale = box.width / BOARD;
    const him = state.players[0];
    const dx = event.clientX - (box.left + (him.x + 0.5) * CELL * scale);
    const dy = event.clientY - (box.top + (him.y + 0.5) * CELL * scale);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < CELL * scale) return; // tapped himself
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? RIGHT : LEFT) : dy > 0 ? DOWN : UP);
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => { drag = null; });

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

import {
  MAX_HABITS, STARTERS, STARTER_LABELS, STATS, STAT_LABELS, MAX_HEALTH,
  FORM_LABELS, FORM_LEVELS,
  dateKey, parseKey, monsterState, latestValue, currentStreak, furnitureAt,
  emptySave, chooseStarter, addHabit, logToday, undoToday, renameHabit,
  deleteHabit, setStat, freeSlots, nameMonster, feedMonster, hasFedToday,
  freePlayOn, todaysProgress, recordScore,
} from './monster.js';
import { createArena } from './arena.js';
import { readSave, writeSave, saveBackup, readBackup } from './storage.js';
import {
  loadArt, drawMonsterAt, drawEgg, drawCell, drawCheer, drawFurniture, drawFeed,
  CELL, ROOM_W, ROOM_H, SPOT_X, FLOOR_Y, hasFrame,
  COL_NORMAL, COL_HAPPY, COL_WORN, COL_BLINK, COL_WALK_A, COL_WALK_B,
  COL_DANCE_A, COL_DANCE_B,
} from './art.js';
import { play, unlock, isMuted, setMuted, setMusic, suspendAudio, resumeAudio } from './sound.js';

const ELEMENTS = { embertail: 'Fire', voltectra: 'Electric', bubbletide: 'Water' };
const BLURBS = {
  embertail: 'A little ember-lizard with charcoal scales and a glowing crystal on its tail. Curious and stubborn, and it throws warm sparks when it gets excited.',
  voltectra: 'A quick, fox-like creature with big ears and cream fur. Its coppery whiskers store static, and it pops tiny harmless sparks to talk to its friends.',
  bubbletide: 'A round river turtle with a smooth jade shell covered in soft moss. It pulls water out of the air to make floating bubbles to play with.',
};

let save = readSave();
let today = dateKey(new Date());
let art = null;
let cheerStart = null;   // when the sparkle burst began
let feedStart = null;    // when the treat started falling
let naming = false;      // the monster's name is being typed
let arenaOpen = false;   // the territory game is on screen

// ?game shows the Play button before launch, so it can be play-tested first.
// ?game=open and ?game=locked force either state, to see what he would see.
// Nothing about it is saved, and his Home Screen app always opens at the same
// address, so he has no way to set it.
const GAME_FLAG = new URLSearchParams(location.search).get('game');

// The version this code belongs to, shown in the footer so a report from his
// phone can be matched to a push. It must equal CACHE in sw.js, and a test
// fails if it does not. It is the running code's own version rather than the
// newest cache, because a new version installs in the background while the
// old one is still on screen.
const BUILD = 'monster-v11';

function gameIsOpen() {
  if (GAME_FLAG === 'open') return true;
  if (GAME_FLAG === 'locked') return false;
  return freePlayOn(save, today);
}
let renamingHabit = null; // id of the habit whose name is being typed
let picking = false;     // the picker is open by choice, not because there is no monster

const scene = document.getElementById('scene');
const ctx = scene.getContext('2d');
const cheerLine = document.getElementById('cheer');

// ---- Scene ----
//
// The room is redrawn every frame so the monster can wander around it. There
// is only one frame per mood, so all the life comes from where it is rather
// than what it looks like: it hops, and it mirrors when heading left.
//
// The background — the room plus whatever furniture he has earned — is drawn
// once into an offscreen canvas and blitted, because the furniture is drawn
// rectangle by rectangle and doing that sixty times a second would be silly.

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const WANDER_MIN_X = 44;
const WANDER_MAX_X = 212;
const HOP_MS = 360;
const HURRY_MS = 240;   // called over, rather than wandering
const HOP_RISE = 6;
const HOP_STEP = 11;
const REST_MIN_MS = 2200;
const REST_MAX_MS = 6000;
const DANCE_MS = 1900;
const DANCE_FLIP_MS = 220;
const DANCE_HOP_MS = 300;
const DANCE_RISE = 9;
const WOBBLE_MS = 600;
const POKE_REACH = 26;
const BLINK_MS = 130;
const BLINK_GAP_MIN = 2600;
const BLINK_GAP_SPREAD = 3600;

const walk = {
  x: SPOT_X, target: SPOT_X, facing: 1,
  hopFrom: 0, hopTo: 0, hopStart: 0, hopMs: HOP_MS,
  restUntil: 0, hurry: false,
};
let danceStart = null;
let wobbleStart = null;
let backdrop = null;
let backdropKey = '';

function backdropFor(state) {
  const key = `${!!art}:${furnitureAt(state.level).map((item) => item.id).join(',')}`;
  if (backdrop && backdropKey === key) return backdrop;
  const canvas = document.createElement('canvas');
  canvas.width = ROOM_W;
  canvas.height = ROOM_H;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (art?.room) g.drawImage(art.room, 0, 0);
  // Furniture goes in the background, so the monster walks in front of it.
  for (const item of furnitureAt(state.level)) drawFurniture(g, art, item.id);
  backdrop = canvas;
  backdropKey = key;
  return canvas;
}

// Moves the monster along, and returns how far off the floor it is right now.
function stepWalk(now, state) {
  if (danceStart !== null) {
    const t = now - danceStart;
    if (t >= DANCE_MS) {
      danceStart = null;
      walk.facing = 1;
      walk.restUntil = now + 800;
      return 0;
    }
    walk.facing = Math.floor(t / DANCE_FLIP_MS) % 2 ? -1 : 1;
    return Math.sin((Math.PI * (t % DANCE_HOP_MS)) / DANCE_HOP_MS) * DANCE_RISE;
  }

  // It stands still to eat, and when it is worn out it has no energy to roam.
  if (!state.hatched || state.wornOut || feedStart !== null || REDUCED_MOTION) return 0;

  if (walk.hopStart) {
    const p = (now - walk.hopStart) / walk.hopMs;
    if (p >= 1) {
      walk.x = walk.hopTo;
      walk.hopStart = 0;
      if (Math.abs(walk.x - walk.target) < 1) {
        walk.hurry = false;
        walk.restUntil = now + REST_MIN_MS + Math.random() * (REST_MAX_MS - REST_MIN_MS);
      }
      return 0;
    }
    walk.x = walk.hopFrom + (walk.hopTo - walk.hopFrom) * p;
    return Math.sin(Math.PI * p) * HOP_RISE;
  }

  if (now < walk.restUntil) return 0;
  if (Math.abs(walk.x - walk.target) < 1) {
    // Somewhere far enough away to be worth the trip.
    let next = walk.x;
    while (Math.abs(next - walk.x) < 30) {
      next = WANDER_MIN_X + Math.random() * (WANDER_MAX_X - WANDER_MIN_X);
    }
    walk.target = next;
  }
  const dir = walk.target > walk.x ? 1 : -1;
  walk.facing = dir;
  walk.hopFrom = walk.x;
  walk.hopTo = walk.x + dir * Math.min(HOP_STEP, Math.abs(walk.target - walk.x));
  walk.hopStart = now;
  walk.hopMs = walk.hurry ? HURRY_MS : HOP_MS;
  return 0;
}

function drawScene(now) {
  const state = monsterState(save, today);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(backdropFor(state), 0, 0);

  if (!state.hatched) {
    // A poked egg rocks, and settles.
    let shift = 0;
    if (wobbleStart !== null) {
      const t = (now - wobbleStart) / WOBBLE_MS;
      if (t >= 1) wobbleStart = null;
      else shift = Math.sin(t * Math.PI * 6) * 3 * (1 - t);
    }
    drawEgg(ctx, SPOT_X + Math.round(shift));
    return;
  }
  if (!state.species) return;

  // With a real walk cycle the legs do the work, so the hop drops to a bob.
  const bob = hasFrame(art, state.species, COL_WALK_B) && walk.hopStart ? 0.3 : 1;
  const rise = stepWalk(now, state) * bob;
  drawMonsterAt(ctx, art, state.species, state.form, frameFor(state, now), walk.x, rise, walk.facing);

  // Both of these follow the monster, wherever it has wandered to.
  if (feedStart !== null && !drawFeed(ctx, now - feedStart, walk.x)) feedStart = null;
  if (cheerStart !== null && !drawCheer(ctx, now - cheerStart, walk.x)) cheerStart = null;
}

// One loop for the whole room. Browsers already pause requestAnimationFrame
// while a page is hidden, so there is nothing to do about that here: checking
// visibilityState as well stopped the loop dead in contexts that report hidden
// but keep calling back, and it never started again.
let looping = false;

function frame(now) {
  // Nothing to draw while the starter picker is up.
  if (!document.getElementById('game').hidden) drawScene(now);
  requestAnimationFrame(frame);
}

function startLoop() {
  if (looping) return;
  looping = true;
  requestAnimationFrame(frame);
}

// Poking it: the monster dances, the egg rocks.
scene.onclick = (event) => {
  const state = monsterState(save, today);
  if (!state.species) return;
  const box = scene.getBoundingClientRect();
  const x = (event.clientX - box.left) * (ROOM_W / box.width);
  const y = (event.clientY - box.top) * (ROOM_H / box.height);
  const centre = state.hatched ? walk.x : SPOT_X;
  const reachesUp = state.hatched ? 62 : 36;

  const onIt = Math.abs(x - centre) <= POKE_REACH && y >= FLOOR_Y - reachesUp && y <= FLOOR_Y + 3;

  if (!state.hatched) {
    if (onIt && wobbleStart === null) {
      wobbleStart = performance.now();
      play('tap');
    }
    return;
  }

  if (onIt) {
    // Not while it is eating, and not on top of a dance already going.
    if (danceStart !== null || feedStart !== null) return;
    danceStart = performance.now();
    play('tap');
    return;
  }

  // Tapped somewhere else in the room: come over here. Any height counts,
  // because a 7-year-old aiming at the floor line is not a fair ask.
  if (state.wornOut || feedStart !== null || danceStart !== null || REDUCED_MOTION) return;
  walk.target = Math.min(WANDER_MAX_X, Math.max(WANDER_MIN_X, x));
  walk.restUntil = 0;
  // It hurries when called, rather than ambling the way it does on its own.
  walk.hurry = true;
};

// Which column of the sheet to draw. Creatures whose movement frames have not
// been drawn yet simply never reach those branches, and fall back to hopping
// and mirroring the three frames they do have.
let blinkUntil = 0;
let nextBlink = 0;

function frameFor(state, now) {
  const species = state.species;
  if (danceStart !== null) {
    if (hasFrame(art, species, COL_DANCE_B)) {
      return Math.floor((now - danceStart) / DANCE_FLIP_MS) % 2 ? COL_DANCE_B : COL_DANCE_A;
    }
    return COL_HAPPY;
  }
  // Whatever else is true, it is pleased about being fed.
  if (feedStart !== null) return COL_HAPPY;
  if (state.wornOut) return COL_WORN;
  if (loggedToday()) return COL_HAPPY;

  if (walk.hopStart && hasFrame(art, species, COL_WALK_B)) {
    return Math.floor((now - walk.hopStart) / (walk.hopMs / 2)) % 2 ? COL_WALK_B : COL_WALK_A;
  }
  // A blink every few seconds, so standing still does not mean standing dead.
  if (hasFrame(art, species, COL_BLINK) && !walk.hopStart) {
    if (now > nextBlink) {
      blinkUntil = now + BLINK_MS;
      nextBlink = now + BLINK_GAP_MIN + Math.random() * BLINK_GAP_SPREAD;
    }
    if (now < blinkUntil) return COL_BLINK;
  }
  return COL_NORMAL;
}

function loggedToday() {
  return save.habits.some((h) => today in h.logs);
}

// ---- Small helpers ----

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== false));
  return node;
}

function button(text, onClick, className = '') {
  return el('button', { type: 'button', className, textContent: text, onclick: onClick });
}

function shortDate(key) {
  return parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(habit, value) {
  return habit.unit ? `${value} ${habit.unit}` : String(value);
}

// Saves, then re-renders. Anything that changes the save goes through here so
// the level floor is kept up to date and level-ups are announced once.
function commit(next, { cheer = false } = {}) {
  const before = monsterState(save, today);
  save = next;
  writeSave(save);
  const after = monsterState(save, today);

  if (cheer) cheerStart = performance.now();
  const gained = furnitureAt(after.level).filter((item) => item.level > before.level);
  // The biggest thing that happened wins, so a hatch or an evolution is not
  // drowned out by the ordinary logging sound.
  if (!before.hatched && after.hatched) {
    announce(`${STARTER_LABELS[after.species]} hatched!`);
    // No hatch sound was made, so the first evolution fanfare stands in.
    play('evolve1');
    // Right after it comes out of the egg is the moment to name it, once the
    // fanfare has had a second to play.
    setTimeout(askName, 1500);
  } else if (after.form > before.form) {
    announce(`${STARTER_LABELS[after.species]} evolved into its ${FORM_LABELS[after.form].toLowerCase()} form!`);
    play(after.form === 2 ? 'evolve2' : 'evolve1');
  } else if (gained.length) {
    announce(`Level ${after.level}! ${gained.map((item) => item.label).join(' and ')}.`);
    play('levelUp');
    // The coin lands after the level-up sound, as the reward for it.
    setTimeout(() => play('coin'), 650);
  } else if (after.level > before.level) {
    announce(`Level ${after.level}!`);
    play('levelUp');
  } else if (cheer) {
    play('log');
  }
  render();
}

let announceTimer = null;
function announce(text) {
  cheerLine.textContent = text;
  cheerLine.classList.add('shown');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    cheerLine.classList.remove('shown');
  }, 3600);
}

// ---- Picker ----

function starterCard(species) {
  const canvas = el('canvas', {
    width: CELL,
    height: CELL,
    className: 'pick-art',
    role: 'img',
    ariaLabel: `${STARTER_LABELS[species]}, just hatched`,
  });
  // Only the hatchling is ever drawn here, so choosing never spoils the
  // forms it grows into.
  if (art) drawCell(canvas.getContext('2d'), art, species, 0, COL_NORMAL, 0, 0);

  const current = monsterState(save, today).species === species;
  return el('article', { className: `pick${current ? ' current' : ''}` },
    el('div', { className: 'pick-frame' }, canvas),
    el('h3', { textContent: STARTER_LABELS[species] }),
    el('p', { className: 'element', textContent: ELEMENTS[species] }),
    el('p', { className: 'blurb', textContent: BLURBS[species] }),
    button(current ? 'Chosen' : 'Choose', () => pick(species), current ? 'ghost' : ''));
}

function pick(species) {
  play('confirm');
  picking = false;
  const base = save.monsters.length ? { ...save, monsters: [], activeMonster: null } : save;
  commit(chooseStarter(base, species, today));
}

function renderPicker() {
  document.getElementById('picks').replaceChildren(...STARTERS.map(starterCard));
}

// ---- Status strip ----

function renderStatus(state) {
  const species = state.species ? STARTER_LABELS[state.species] : null;
  // His name on top, what it is underneath. The species is only repeated in
  // the subtitle when the name differs from it, so nothing says it twice.
  document.getElementById('monster-name').textContent = state.name ?? species ?? 'Egg';
  const kind = [];
  if (state.name && species && state.name !== species) kind.push(species);
  kind.push(state.hatched ? FORM_LABELS[state.form] : 'Not hatched yet');
  document.getElementById('kind').textContent = kind.join(' · ');
  document.getElementById('level').textContent = state.hatched ? `Level ${state.level}` : '';

  const rename = document.getElementById('rename-monster');
  rename.textContent = state.name ? 'Rename' : 'Give it a name';

  const form = document.getElementById('name-form');
  form.hidden = !naming;
  document.querySelector('.manage-monster').hidden = naming;
  if (naming) document.getElementById('name-input').value = state.name ?? '';

  // One treat a day. Hidden until it has hatched: there is no mouth yet.
  const feed = document.getElementById('feed');
  const fed = hasFedToday(save, today);
  feed.hidden = !state.hatched;
  feed.disabled = fed;
  // No digits in the label: the pixel font's numbers are hard to read.
  feed.textContent = fed ? 'Fed today' : 'Feed him a treat';

  renderPlay(state);

  const fraction = state.levelNeeds ? Math.min(1, state.intoLevel / state.levelNeeds) : 0;
  const fill = document.getElementById('xp-fill');
  fill.style.width = `${fraction * 100}%`;
  // Red when empty, green as it fills.
  fill.style.background = `hsl(${Math.round(4 + 96 * fraction)} 62% 44%)`;
  const track = document.getElementById('xp-track');
  track.role = 'progressbar';
  track.ariaValueNow = String(state.intoLevel);
  track.ariaValueMax = String(state.levelNeeds);
  document.getElementById('xp-label').textContent = `${state.intoLevel} / ${state.levelNeeds} XP`;

  const pips = Array.from({ length: MAX_HEALTH }, (_, i) =>
    el('span', { className: `pip${i < state.health ? ' full' : ''}`, ariaHidden: 'true' }));
  const health = document.getElementById('health');
  health.replaceChildren(...pips);
  health.title = state.wornOut ? 'Worn out' : `Health ${state.health} of ${MAX_HEALTH}`;
  health.setAttribute('aria-label', health.title);

  // Switching is free until the egg hatches, and impossible after.
  document.getElementById('change-starter').hidden = state.hatched;
}

function renderStats(state) {
  const panel = document.getElementById('stats-panel');
  // Stats appear with the first evolution, not on day one.
  panel.hidden = state.level < FORM_LEVELS[1];
  if (panel.hidden) return;
  document.getElementById('stat-list').replaceChildren(
    ...STATS.flatMap((stat) => [
      el('dt', { textContent: STAT_LABELS[stat] }),
      el('dd', { textContent: String(state.stats[stat]) }),
    ]));
}

// ---- Habit cards ----

// What the habit trains, always changeable. A wrong stat is otherwise a label
// he would look at every day for months, and nothing keys off stats, so there
// is nothing to protect by making the choice final. Changing one moves the
// habit's whole history to the new stat.
function statControl(habit, state) {
  // Stats appear with the first evolution, not on day one when they mean
  // nothing, so before that a habit simply has none.
  if (state.level < FORM_LEVELS[1]) return null;
  const select = el('select', { className: 'stat-select', ariaLabel: `What ${habit.name} trains` },
    el('option', { value: '', textContent: 'Pick one…' }),
    ...STATS.map((s) => el('option', { value: s, textContent: STAT_LABELS[s] })));
  select.value = habit.stat ?? '';
  select.onchange = () => {
    if (!select.value) return;
    play('confirm');
    commit(setStat(save, habit.id, select.value));
  };
  return el('label', { className: 'trains' }, el('span', { textContent: 'Trains' }), select);
}

// The habit's name, typed in place. Same reason as the monster's: a prompt()
// announces the site's address before the question.
function renameForm(habit) {
  const input = el('input', { type: 'text', value: habit.name, maxLength: 40, ariaLabel: 'Habit name' });
  const form = el('form', {
    className: 'rename-row',
    onsubmit: (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      renamingHabit = null;
      play('confirm');
      commit(renameHabit(save, habit.id, input.value));
    },
  }, input, el('button', { type: 'submit', textContent: 'Save' }),
     button('Cancel', () => { renamingHabit = null; render(); }, 'ghost'));
  // The card is rebuilt on every render, so focus has to wait for it to land.
  setTimeout(() => { input.focus(); input.select(); }, 0);
  return form;
}

function habitCard(habit, state) {
  const done = today in habit.logs;
  const streak = currentStreak(habit, today);
  const total = Object.keys(habit.logs).length;
  const latest = habit.type === 'number' ? latestValue(habit) : null;

  let action;
  if (done) {
    const label = habit.type === 'number' ? `Today: ${formatValue(habit, habit.logs[today])}` : 'Done today';
    action = el('div', { className: 'done' },
      el('span', { textContent: label }),
      button('Undo', () => {
        play('cancel');
        commit(undoToday(save, habit.id, today));
      }, 'ghost small'));
  } else if (habit.type === 'number') {
    const input = el('input', { type: 'number', step: 'any', required: true, placeholder: habit.unit || 'value', ariaLabel: `${habit.name} value` });
    action = el('form', {
      className: 'log',
      onsubmit: (e) => {
        e.preventDefault();
        const value = Number(input.value);
        if (input.value !== '' && Number.isFinite(value)) {
          commit(logToday(save, habit.id, today, value), { cheer: true });
        } else {
          play('error');
        }
      },
    }, input, el('button', { type: 'submit', textContent: 'Log it' }));
  } else {
    action = button('Did it today', () => commit(logToday(save, habit.id, today), { cheer: true }));
  }

  const rename = () => {
    renamingHabit = habit.id;
    render();
  };
  const remove = () => {
    if (confirm(`Delete "${habit.name}"? The card goes away, but the experience it earned stays.`)) {
      play('cancel');
      commit(deleteHabit(save, habit.id, today));
    }
  };

  return el('article', { className: 'card' },
    renamingHabit === habit.id ? renameForm(habit) : el('h2', { textContent: habit.name }),
    el('p', { className: 'meta', textContent: `Streak ${streak} · ${total} day${total === 1 ? '' : 's'}` }),
    latest && latest.day !== today
      ? el('p', { className: 'meta', textContent: `Last: ${formatValue(habit, latest.value)} on ${shortDate(latest.day)}` })
      : null,
    statControl(habit, state),
    action,
    el('div', { className: 'manage' }, button('Rename', rename, 'link'), button('Delete', remove, 'link')));
}

function emptyCard(offerForm, state) {
  if (!offerForm) {
    return el('article', { className: 'card empty' }, el('p', { className: 'hint', textContent: 'Empty spot' }));
  }
  const name = el('input', { type: 'text', required: true, maxLength: 40, placeholder: 'Walk, read, brush teeth…', ariaLabel: 'Habit name' });
  const type = el('select', { ariaLabel: 'Habit type' },
    el('option', { value: 'check', textContent: 'Yes / no' }),
    el('option', { value: 'number', textContent: 'Number' }));
  const unit = el('input', { type: 'text', maxLength: 12, placeholder: 'Unit, like lbs', ariaLabel: 'Unit', hidden: true });
  type.onchange = () => { unit.hidden = type.value !== 'number'; };

  const withStats = state.level >= FORM_LEVELS[1];
  const stat = el('select', { ariaLabel: 'What it trains' },
    el('option', { value: '', textContent: 'What does it train?' }),
    ...STATS.map((s) => el('option', { value: s, textContent: STAT_LABELS[s] })));

  return el('article', { className: 'card empty' },
    el('h2', { textContent: 'New habit' }),
    el('form', {
      className: 'add',
      onsubmit: (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        play('confirm');
        commit(addHabit(save, {
          name: name.value,
          type: type.value,
          unit: unit.value,
          stat: withStats && stat.value ? stat.value : null,
        }, today));
      },
    }, name, type, unit, withStats ? stat : null, el('button', { type: 'submit', textContent: 'Add it' })));
}

function renderCards(state) {
  const bySlot = new Map(save.habits.map((h) => [h.slot, h]));
  let offered = false;
  document.getElementById('cards').replaceChildren(
    ...Array.from({ length: MAX_HABITS }, (_, slot) => {
      const habit = bySlot.get(slot);
      if (habit) return habitCard(habit, state);
      const card = emptyCard(!offered, state);
      offered = true;
      return card;
    }));
}

// ---- Footer ----

function renderFooter() {
  document.getElementById('today').textContent = parseKey(today).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const age = document.getElementById('backup-age');
  if (!save.lastBackupAt) {
    age.textContent = 'Last backup: never';
  } else {
    const days = Math.round((parseKey(today) - parseKey(save.lastBackupAt)) / 86400000);
    age.textContent = `Last backup: ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`;
  }
  age.classList.toggle('stale', !save.lastBackupAt || Number(age.textContent.match(/(\d+) days/)?.[1]) >= 14);

  document.getElementById('art-note').textContent =
    art?.missing.length ? `Missing art: ${art.missing.join(', ')}. Put it in assets/.` : '';
}

// ---- Render ----

function render() {
  const state = monsterState(save, today);
  const showPicker = picking || !state.species;
  document.getElementById('picker').hidden = !showPicker || arenaOpen;
  document.getElementById('game').hidden = showPicker || arenaOpen;
  // The backup buttons sit right under the arrow pad on a phone, where a
  // mashed "down" could land on one mid-round.
  document.querySelector('.bottom').hidden = arenaOpen;
  if (arenaOpen) return; // the game screen looks after itself
  setMusic(showPicker ? 'title' : 'room');

  if (showPicker) renderPicker();
  else {
    renderStatus(state);
    renderStats(state);
    renderCards(state);
  }
  renderFooter();
}

function renderMute() {
  const button = document.getElementById('mute');
  button.textContent = isMuted() ? 'Sound: off' : 'Sound: on';
  button.setAttribute('aria-pressed', String(isMuted()));
}

document.getElementById('mute').onclick = () => {
  setMuted(!isMuted());
  renderMute();
  // Turning it back on should make a noise, so you know it worked.
  if (!isMuted()) play('tap');
};

// Phones refuse to play audio until the person has interacted with the page,
// so the first tap anywhere is what actually starts it.
document.addEventListener('pointerdown', unlock, { once: true });
document.addEventListener('keydown', unlock, { once: true });

// ---- The game's button ----

// The button says whether the game is open now, which depends on yesterday.
// The line under it says whether it will be open tomorrow, which depends on
// today — the thing he can still do something about.
function renderPlay(state) {
  const row = document.getElementById('play-row');
  row.hidden = GAME_FLAG === null || !state.hatched;
  if (row.hidden) return;

  const open = gameIsOpen();
  const button = document.getElementById('play');
  button.classList.toggle('locked', !open);
  button.textContent = open ? '\u{1F3AE} Play' : '\u{1F512} Locked';
  button.setAttribute('aria-label', open ? 'Play the game' : 'The game is locked');

  const line = document.getElementById('tomorrow');
  const { done, total, finished, retiredUnlogged } = todaysProgress(save, today);
  line.classList.toggle('ready', finished);
  if (!total) {
    line.textContent = 'Add a habit to start earning free play.';
  } else if (finished) {
    line.textContent = 'All done! Free play tomorrow \u2713';
  } else {
    const left = total - done;
    const note = retiredUnlogged ? ' (one you deleted today still counts)' : '';
    line.textContent = `${done} of ${total} done${note}. ${left === 1 ? 'One more' : `${left} more`} and tomorrow is free play.`;
  }
}

let lockedNote = null;

document.getElementById('play').onclick = () => {
  const state = monsterState(save, today);
  if (!gameIsOpen()) {
    // A shake and a soft tap, not the error sound: he has done nothing wrong.
    const button = document.getElementById('play');
    button.classList.remove('shake');
    void button.offsetWidth; // restart the animation if he taps again
    button.classList.add('shake');
    play('tap');
    const line = document.getElementById('tomorrow');
    line.textContent = 'Finish all your habits today to play tomorrow!';
    clearTimeout(lockedNote);
    lockedNote = setTimeout(() => renderPlay(monsterState(save, today)), 2600);
    return;
  }
  play('confirm');
  arenaOpen = true;
  render();
  arena.open({ species: state.species, form: state.form });
};

const arena = createArena({
  getArt: () => art,
  canStart: gameIsOpen,
  // Keeps the best and hands it back, so the end screen can say whether this
  // round beat it.
  onScore(percent) {
    save = recordScore(save, save.activeMonster, percent);
    writeSave(save);
    return save.monsters.find((m) => m.id === save.activeMonster)?.bestScore ?? percent;
  },
  onExit() {
    arenaOpen = false;
    render();
  },
});

// Opens the inline field. Leaving it empty keeps the species name, which is
// a fine answer.
function askName() {
  if (!monsterState(save, today).species) return;
  naming = true;
  render();
  const input = document.getElementById('name-input');
  input.focus();
  input.select();
}

function stopNaming() {
  naming = false;
  render();
}

document.getElementById('rename-monster').onclick = askName;
document.getElementById('name-cancel').onclick = stopNaming;
document.getElementById('name-form').onsubmit = (e) => {
  e.preventDefault();
  naming = false;
  play('confirm');
  commit(nameMonster(save, save.activeMonster, document.getElementById('name-input').value));
};

document.getElementById('feed').onclick = () => {
  if (hasFedToday(save, today)) return;
  feedStart = performance.now();
  play('eat');
  commit(feedMonster(save, save.activeMonster, today));
};

document.getElementById('change-starter').onclick = () => {
  play('tap');
  picking = true;
  render();
};

document.getElementById('export').onclick = async () => {
  const backup = { ...save, lastBackupAt: today };
  if (!(await saveBackup(backup, today))) return;
  save = backup;
  writeSave(save);
  renderFooter();
};

document.getElementById('import').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = await readBackup(file);
    if (confirm(`Replace what's here with the ${imported.habits.length} habit(s) in this backup?`)) {
      picking = false;
      commit(imported);
    }
  } catch (err) {
    play('error');
    alert(`Couldn't import that file. ${err.message}`);
  }
};

// Roll over to the new day if the app stays open past midnight, and check
// again whenever it comes back to the front, since phones pause background apps.
function checkDay() {
  const now = dateKey(new Date());
  if (now !== today) {
    today = now;
    render();
  }
}
setInterval(checkDay, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    suspendAudio();
    return;
  }
  checkDay();
  startLoop();
  resumeAudio();
});

// Locking the phone or closing the app does not always fire visibilitychange
// first, so stop the sound on the way out too.
window.addEventListener('pagehide', suspendAudio);
window.addEventListener('blur', suspendAudio);
window.addEventListener('focus', resumeAudio);

window.addEventListener('pageshow', () => {
  checkDay();
  startLoop();
  resumeAudio();
});

// Offline support for the published site. Skipped on localhost so edits
// show up on a normal reload while developing.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js');
}

document.getElementById('build').textContent = `Build ${BUILD.replace('monster-', '')}`;
renderMute();
render();
startLoop();
loadArt().then((loaded) => {
  art = loaded;
  render();
});

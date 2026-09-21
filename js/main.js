import {
  MAX_HABITS, STARTERS, STARTER_LABELS, STATS, STAT_LABELS, MAX_HEALTH,
  FORM_LABELS, FORM_LEVELS,
  dateKey, parseKey, monsterState, withLevelFloor, latestValue, currentStreak,
  emptySave, chooseStarter, addHabit, logToday, undoToday, renameHabit,
  deleteHabit, setStat, freeSlots,
} from './monster.js';
import { readSave, writeSave, saveBackup, readBackup } from './storage.js';
import {
  loadArt, drawMonster, drawEgg, drawCell, drawCheer,
  CELL, ROOM_W, ROOM_H, CHEER_MS, MOOD_NORMAL, MOOD_HAPPY, MOOD_WORN,
} from './art.js';
import { play, unlock, isMuted, setMuted } from './sound.js';

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
let picking = false;     // the picker is open by choice, not because there is no monster

const scene = document.getElementById('scene');
const ctx = scene.getContext('2d');
const cheerLine = document.getElementById('cheer');

// ---- Scene ----

function drawScene(now = performance.now()) {
  ctx.clearRect(0, 0, ROOM_W, ROOM_H);
  ctx.imageSmoothingEnabled = false;
  if (art?.room) ctx.drawImage(art.room, 0, 0);

  const state = monsterState(save, today);
  if (!state.hatched) {
    drawEgg(ctx);
  } else if (state.species) {
    drawMonster(ctx, art, state.species, state.form, moodFor(state));
  }

  if (cheerStart !== null) {
    if (drawCheer(ctx, now - cheerStart)) {
      requestAnimationFrame(drawScene);
    } else {
      cheerStart = null;
      drawScene();
    }
  }
}

function moodFor(state) {
  if (state.wornOut) return MOOD_WORN;
  return loggedToday() ? MOOD_HAPPY : MOOD_NORMAL;
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
  save = withLevelFloor(next, today);
  writeSave(save);
  const after = monsterState(save, today);

  if (cheer) cheerStart = performance.now();
  // The biggest thing that happened wins, so a hatch or an evolution is not
  // drowned out by the ordinary logging sound.
  if (!before.hatched && after.hatched) {
    announce(`${STARTER_LABELS[after.species]} hatched!`);
    play('hatch');
  } else if (after.form > before.form) {
    announce(`${STARTER_LABELS[after.species]} evolved into its ${FORM_LABELS[after.form].toLowerCase()} form!`);
    play('evolve');
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
  if (art) drawCell(canvas.getContext('2d'), art, species, 0, MOOD_NORMAL, 0, 0);

  const current = monsterState(save, today).species === species;
  return el('article', { className: `pick${current ? ' current' : ''}` },
    el('div', { className: 'pick-frame' }, canvas),
    el('h3', { textContent: STARTER_LABELS[species] }),
    el('p', { className: 'element', textContent: ELEMENTS[species] }),
    el('p', { className: 'blurb', textContent: BLURBS[species] }),
    button(current ? 'Chosen' : 'Choose', () => pick(species), current ? 'ghost' : ''));
}

function pick(species) {
  picking = false;
  const base = save.monsters.length ? { ...save, monsters: [], activeMonster: null } : save;
  commit(chooseStarter(base, species, today));
}

function renderPicker() {
  document.getElementById('picks').replaceChildren(...STARTERS.map(starterCard));
}

// ---- Status strip ----

function renderStatus(state) {
  document.getElementById('monster-name').textContent =
    state.hatched ? STARTER_LABELS[state.species] : 'Egg';
  document.getElementById('level').textContent =
    state.hatched ? `Level ${state.level} · ${FORM_LABELS[state.form]}` : 'Not hatched yet';

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
  document.querySelector('.restart').hidden = state.hatched;
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

function statPicker(habit, state) {
  // A habit made before the first evolution is asked what it trains once
  // stats exist, rather than on day one when they mean nothing.
  if (habit.stat || state.level < FORM_LEVELS[1]) return null;
  const select = el('select', { ariaLabel: `What ${habit.name} trains` },
    el('option', { value: '', textContent: 'Pick a stat…' }),
    ...STATS.map((s) => el('option', { value: s, textContent: STAT_LABELS[s] })));
  select.onchange = () => { if (select.value) commit(setStat(save, habit.id, select.value)); };
  return el('div', { className: 'stat-pick' },
    el('p', { className: 'hint', textContent: 'What does this train?' }), select);
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
      button('Undo', () => commit(undoToday(save, habit.id, today)), 'ghost small'));
  } else if (habit.type === 'number') {
    const input = el('input', { type: 'number', step: 'any', required: true, placeholder: habit.unit || 'value', ariaLabel: `${habit.name} value` });
    action = el('form', {
      className: 'log',
      onsubmit: (e) => {
        e.preventDefault();
        const value = Number(input.value);
        if (input.value !== '' && Number.isFinite(value)) {
          commit(logToday(save, habit.id, today, value), { cheer: true });
        }
      },
    }, input, el('button', { type: 'submit', textContent: 'Log it' }));
  } else {
    action = button('Did it today', () => commit(logToday(save, habit.id, today), { cheer: true }));
  }

  const rename = () => {
    const name = prompt('Rename habit', habit.name);
    if (name && name.trim()) commit(renameHabit(save, habit.id, name));
  };
  const remove = () => {
    if (confirm(`Delete "${habit.name}"? The card goes away, but the experience it earned stays.`)) {
      commit(deleteHabit(save, habit.id));
    }
  };

  return el('article', { className: 'card' },
    el('h2', { textContent: habit.name }),
    habit.stat ? el('p', { className: 'trains', textContent: `Trains ${STAT_LABELS[habit.stat]}` }) : null,
    el('p', { className: 'meta', textContent: `Streak ${streak} · ${total} day${total === 1 ? '' : 's'}` }),
    latest && latest.day !== today
      ? el('p', { className: 'meta', textContent: `Last: ${formatValue(habit, latest.value)} on ${shortDate(latest.day)}` })
      : null,
    statPicker(habit, state),
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
  document.getElementById('picker').hidden = !showPicker;
  document.getElementById('game').hidden = showPicker;

  if (showPicker) renderPicker();
  else {
    renderStatus(state);
    renderStats(state);
    renderCards(state);
    drawScene();
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
};

// Phones refuse to play audio until the person has interacted with the page,
// so the first tap anywhere is what actually starts it.
document.addEventListener('pointerdown', unlock, { once: true });
document.addEventListener('keydown', unlock, { once: true });

document.getElementById('change-starter').onclick = () => {
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
  if (document.visibilityState === 'visible') checkDay();
});
window.addEventListener('pageshow', checkDay);

// Offline support for the published site. Skipped on localhost so edits
// show up on a normal reload while developing.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js');
}

renderMute();
render();
loadArt().then((loaded) => {
  art = loaded;
  render();
});

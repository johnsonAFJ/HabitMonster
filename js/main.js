import {
  MAX_HABITS, SPECIES, SPECIES_LABELS, HEALTH_LABELS, GROWTH_LABELS,
  dateKey, parseKey, plantState, latestValue,
  addHabit, logToday, undoToday, renameHabit, deleteHabit,
} from './garden.js';
import { loadGarden, saveGarden, saveBackup, readBackup } from './storage.js';
import { loadArt, drawPlant, drawCell, drawWatering, SPOTS_X, WATER_FRAMES } from './sprites.js';

const FRAME_MS = 140;
const PREVIEW_KEY = 'habit-monster-show-previews';

let garden = loadGarden();
let today = dateKey(new Date());
let art = null;
// Showing the full-grown plant on each card is a per-browser preference, off by default.
let showPreviews = readPreference();
// While the can is pouring, the plant keeps its old look until the water lands.
let watering = null; // { slot, start, before: { growth, health } }

const scene = document.getElementById('scene');
const ctx = scene.getContext('2d');
const cards = document.getElementById('cards');

function readPreference() {
  try {
    return localStorage.getItem(PREVIEW_KEY) === 'true';
  } catch {
    return false;
  }
}

function commit(next) {
  garden = next;
  saveGarden(garden);
  render();
}

// ---- Scene ----

function drawScene(now = performance.now()) {
  if (!art) return;
  ctx.clearRect(0, 0, scene.width, scene.height);
  ctx.drawImage(art.terrarium, 0, 0);
  for (const habit of garden.habits) {
    const look = watering?.slot === habit.slot ? watering.before : plantState(habit, today);
    drawPlant(ctx, art, SPECIES.indexOf(habit.species), look.growth, look.health, SPOTS_X[habit.slot]);
  }
  if (watering) {
    const frame = Math.floor((now - watering.start) / FRAME_MS);
    if (frame >= WATER_FRAMES) {
      watering = null;
      drawScene();
      return;
    }
    drawWatering(ctx, art, SPOTS_X[watering.slot], frame);
    requestAnimationFrame(drawScene);
  }
}

function water(habit, value) {
  const { growth, health } = plantState(habit, today);
  watering = { slot: habit.slot, start: performance.now(), before: { growth, health } };
  commit(logToday(garden, habit.id, today, value));
}

// ---- Cards ----

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

// The plant as it looks at full bloom and full health. Picture only; the
// label is a tooltip. Whole-number scaling keeps the pixels square.
function preview(habit) {
  if (!showPreviews || !art) return null;
  const label = `Full grown ${SPECIES_LABELS[habit.species].toLowerCase()}`;
  const scale = Math.max(1, Math.floor(64 / art.cell));
  const canvas = el('canvas', { width: art.cell, height: art.cell, className: 'preview', title: label, role: 'img', ariaLabel: label });
  canvas.style.width = canvas.style.height = `${art.cell * scale}px`;
  drawCell(canvas.getContext('2d'), art, SPECIES.indexOf(habit.species), 3, 0, 0, 0);
  return canvas;
}

function habitCard(habit) {
  const state = plantState(habit, today);
  const latest = habit.type === 'number' ? latestValue(habit) : null;

  let action;
  if (state.wateredToday) {
    const done = habit.type === 'number' ? `Today: ${formatValue(habit, habit.logs[today])}` : 'Done today';
    action = el('div', { className: 'done' },
      el('span', { textContent: done }),
      button('Undo', () => commit(undoToday(garden, habit.id, today)), 'ghost small'));
  } else if (habit.type === 'number') {
    const input = el('input', { type: 'number', step: 'any', required: true, placeholder: habit.unit || 'value', ariaLabel: `${habit.name} value` });
    action = el('form', {
      className: 'log',
      onsubmit: (e) => {
        e.preventDefault();
        const value = Number(input.value);
        if (input.value !== '' && Number.isFinite(value)) water(habit, value);
      },
    }, input, el('button', { type: 'submit', textContent: 'Log it' }));
  } else {
    action = button('Did it today', () => water(habit, true));
  }

  const rename = () => {
    const name = prompt('Rename habit', habit.name);
    if (name && name.trim()) commit(renameHabit(garden, habit.id, name));
  };
  const remove = () => {
    if (confirm(`Delete "${habit.name}"? Its plant and all its history will be gone.`)) {
      commit(deleteHabit(garden, habit.id));
    }
  };

  return el('article', { className: `card health-${state.health}` },
    el('div', { className: 'card-head' },
      el('div', { className: 'info' },
        el('h2', { textContent: habit.name }),
        el('p', { className: 'plant', textContent: `${SPECIES_LABELS[habit.species]} · ${GROWTH_LABELS[state.growth]}` }),
        el('p', { className: 'health', textContent: HEALTH_LABELS[state.health] }),
        el('p', { className: 'stats', textContent: `Streak ${state.streak} · ${state.total} day${state.total === 1 ? '' : 's'} watered` }),
        latest && latest.day !== today
          ? el('p', { className: 'stats', textContent: `Last: ${formatValue(habit, latest.value)} on ${shortDate(latest.day)}` })
          : null),
      preview(habit)),
    action,
    el('div', { className: 'manage' }, button('Rename', rename, 'link'), button('Delete', remove, 'link')),
  );
}

function emptyCard(isFirstEmpty) {
  if (!isFirstEmpty) {
    return el('article', { className: 'card empty' }, el('p', { className: 'hint', textContent: 'Empty spot' }));
  }
  const name = el('input', { type: 'text', required: true, maxLength: 40, placeholder: 'Walk, floss, weigh in…', ariaLabel: 'Habit name' });
  const type = el('select', { ariaLabel: 'Habit type' },
    el('option', { value: 'check', textContent: 'Yes / no' }),
    el('option', { value: 'number', textContent: 'Number' }));
  const unit = el('input', { type: 'text', maxLength: 12, placeholder: 'Unit, like lbs', ariaLabel: 'Unit', hidden: true });
  type.onchange = () => { unit.hidden = type.value !== 'number'; };

  return el('article', { className: 'card empty' },
    el('h2', { textContent: 'New habit' }),
    el('form', {
      className: 'add',
      onsubmit: (e) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        commit(addHabit(garden, { name: name.value, type: type.value, unit: unit.value }, today));
      },
    }, name, type, unit, el('button', { type: 'submit', textContent: 'Plant it' })));
}

function renderCards() {
  const bySlot = new Map(garden.habits.map((h) => [h.slot, h]));
  let offeredForm = false;
  cards.replaceChildren(...Array.from({ length: MAX_HABITS }, (_, slot) => {
    const habit = bySlot.get(slot);
    if (habit) return habitCard(habit);
    const card = emptyCard(!offeredForm);
    offeredForm = true;
    return card;
  }));
}

// ---- Footer ----

function renderFooter() {
  document.getElementById('today').textContent = parseKey(today).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const age = document.getElementById('backup-age');
  if (!garden.lastBackupAt) {
    age.textContent = 'Last backup: never';
  } else {
    const days = Math.round((parseKey(today) - parseKey(garden.lastBackupAt)) / 86400000);
    age.textContent = `Last backup: ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`;
  }
  age.classList.toggle('stale', !garden.lastBackupAt || age.textContent.match(/(\d+) days/)?.[1] >= 14);

  document.getElementById('toggle-previews').textContent = showPreviews ? 'Hide full-grown plants' : 'Show full-grown plants';

  const note = document.getElementById('art-note');
  note.textContent = art && !(art.custom.plants && art.custom.terrarium)
    ? 'Using placeholder art. Drop plants.png and terrarium.png into assets/ to use your own.'
    : '';
}

function render() {
  renderCards();
  renderFooter();
  drawScene();
}

document.getElementById('toggle-previews').onclick = () => {
  showPreviews = !showPreviews;
  try {
    localStorage.setItem(PREVIEW_KEY, String(showPreviews));
  } catch {
    // Still toggles for this visit if storage is blocked.
  }
  render();
};

document.getElementById('export').onclick = async () => {
  const backup = { ...garden, lastBackupAt: today };
  if (!(await saveBackup(backup, today))) return;
  garden = backup;
  saveGarden(garden);
  renderFooter();
};

document.getElementById('import').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const imported = await readBackup(file);
    if (confirm(`Replace your garden with the ${imported.habits.length} habit(s) in this backup?`)) commit(imported);
  } catch (err) {
    alert(`Couldn't import that file. ${err.message}`);
  }
};

// Roll over to the new day if the tab stays open past midnight.
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

render();
loadArt().then((loaded) => {
  art = loaded;
  scene.height = art.sceneH;
  render();
});

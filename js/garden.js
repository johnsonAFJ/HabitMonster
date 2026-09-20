// Pure garden rules: dates, health, growth, streaks, habit changes.
// No DOM or storage access here, so it can be tested in Node.

export const MAX_HABITS = 3;
export const SPECIES = ['tulip', 'sunflower', 'echeveria', 'cactus'];
export const SPECIES_LABELS = {
  tulip: 'Tulip',
  sunflower: 'Sunflower',
  echeveria: 'Echeveria',
  cactus: 'Cactus',
};

export const HEALTH_LEVELS = 5; // 0 thriving ... 4 fully wilted
export const HEALTH_LABELS = ['Thriving', 'Slight droop', 'Drooping', 'Wilted', 'Fully wilted'];

// Total days watered needed to reach each growth stage.
export const GROWTH_THRESHOLDS = [0, 7, 21, 45];
export const GROWTH_LABELS = ['Sprout', 'Young', 'Mature', 'Flowering'];

// ---- Dates (local time, keyed as YYYY-MM-DD) ----

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const date = parseKey(key);
  date.setDate(date.getDate() + n);
  return dateKey(date);
}

// ---- Derived plant state ----

// Walks every finished day from creation through yesterday. A watered day
// raises health one level, a missed day drops it one level. Today only
// counts once it's watered, since the day isn't over yet.
export function healthLevel(habit, today) {
  let level = 0;
  for (let day = habit.createdOn; day < today; day = addDays(day, 1)) {
    level = day in habit.logs ? Math.max(0, level - 1) : Math.min(HEALTH_LEVELS - 1, level + 1);
  }
  if (today in habit.logs) level = Math.max(0, level - 1);
  return level;
}

export function daysWatered(habit) {
  return Object.keys(habit.logs).length;
}

export function growthStage(habit) {
  const total = daysWatered(habit);
  let stage = 0;
  GROWTH_THRESHOLDS.forEach((min, i) => {
    if (total >= min) stage = i;
  });
  return stage;
}

// Consecutive watered days ending today. If today isn't logged yet the
// streak is still alive and counts back from yesterday.
export function currentStreak(habit, today) {
  let day = today in habit.logs ? today : addDays(today, -1);
  let streak = 0;
  while (day in habit.logs) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

// Most recent number logged, for number habits.
export function latestValue(habit) {
  const days = Object.keys(habit.logs).sort();
  if (!days.length) return null;
  const day = days[days.length - 1];
  return { day, value: habit.logs[day] };
}

export function plantState(habit, today) {
  return {
    health: healthLevel(habit, today),
    growth: growthStage(habit),
    streak: currentStreak(habit, today),
    total: daysWatered(habit),
    wateredToday: today in habit.logs,
  };
}

// ---- Changes (each returns a new garden object) ----

export function emptyGarden() {
  return { version: 1, habits: [], lastBackupAt: null };
}

export function freeSlots(garden) {
  const used = new Set(garden.habits.map((h) => h.slot));
  return [0, 1, 2].filter((s) => !used.has(s));
}

export function pickSpecies(garden, random = Math.random) {
  const used = new Set(garden.habits.map((h) => h.species));
  const open = SPECIES.filter((s) => !used.has(s));
  return open[Math.floor(random() * open.length)];
}

export function addHabit(garden, { name, type, unit }, today, random = Math.random) {
  const slot = freeSlots(garden)[0];
  if (slot === undefined) throw new Error('The garden already has 3 habits.');
  const habit = {
    id: `h${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`,
    slot,
    name: name.trim(),
    type,
    unit: type === 'number' ? (unit || '').trim() : '',
    species: pickSpecies(garden, random),
    createdOn: today,
    logs: {},
  };
  return { ...garden, habits: [...garden.habits, habit] };
}

function updateHabit(garden, id, change) {
  return { ...garden, habits: garden.habits.map((h) => (h.id === id ? change(h) : h)) };
}

// For number habits `value` is the number; for yes/no habits it's true.
export function logToday(garden, id, today, value = true) {
  return updateHabit(garden, id, (h) => ({ ...h, logs: { ...h.logs, [today]: value } }));
}

export function undoToday(garden, id, today) {
  return updateHabit(garden, id, (h) => {
    const logs = { ...h.logs };
    delete logs[today];
    return { ...h, logs };
  });
}

export function renameHabit(garden, id, name) {
  return updateHabit(garden, id, (h) => ({ ...h, name: name.trim() }));
}

export function deleteHabit(garden, id) {
  return { ...garden, habits: garden.habits.filter((h) => h.id !== id) };
}

// Checks an imported backup before it replaces the garden.
export function validateGarden(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) {
    throw new Error('This file is not a Micro-Habit Garden backup.');
  }
  if (data.habits.length > MAX_HABITS) throw new Error('A backup can hold at most 3 habits.');
  const keyPattern = /^\d{4}-\d{2}-\d{2}$/;
  for (const h of data.habits) {
    const ok =
      typeof h.id === 'string' &&
      typeof h.name === 'string' &&
      [0, 1, 2].includes(h.slot) &&
      ['check', 'number'].includes(h.type) &&
      SPECIES.includes(h.species) &&
      keyPattern.test(h.createdOn) &&
      h.logs && typeof h.logs === 'object' &&
      Object.keys(h.logs).every((k) => keyPattern.test(k));
    if (!ok) throw new Error(`Habit "${h.name ?? '?'}" in the backup is malformed.`);
  }
  return { version: 1, habits: data.habits, lastBackupAt: data.lastBackupAt ?? null };
}

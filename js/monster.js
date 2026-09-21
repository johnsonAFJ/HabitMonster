// Pure monster rules: dates, experience, levels, health, forms, stats and
// habit changes. No DOM or storage access here, so Node can test it.
//
// Everything is derived by replaying `logs`, the same way the garden derived
// plant health and growth. Nothing accumulated is stored, so the numbers can
// never drift from the history.
//
// That means undoing a log takes its experience back, which is the point: an
// undo retracts a claim that the habit was done. Missing a day is different
// and costs nothing, because a day never logged never earned anything.

export const MAX_HABITS = 3;
export const SAVE_VERSION = 2;

export const STARTERS = ['embertail', 'voltectra', 'bubbletide'];
export const STARTER_LABELS = {
  embertail: 'Embertail',
  voltectra: 'Voltectra',
  bubbletide: 'Bubbletide',
};

export const STATS = ['strength', 'speed', 'wisdom', 'charisma'];
export const STAT_LABELS = {
  strength: 'Strength',
  speed: 'Speed',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

export const MAX_HEALTH = 5;

// The level at which each form begins. Index into this is the form number.
export const FORM_LEVELS = [1, 5, 15];
export const FORM_LABELS = ['Hatchling', 'Adolescent', 'Full grown'];

// Level 1 to 2 costs 35, and each level after costs 8 more.
export const LEVEL_BASE = 35;
export const LEVEL_STEP = 8;

// A day is worth at most 40, whether one habit is tracked or three.
export const DAY_BASE = 30;
export const HEALTH_BONUS = 5;
export const BREADTH_BONUS = 5;
export const BREADTH_MIN_LEVEL = 5;
export const MAX_DAY_XP = 40;

// Furniture arrives every third level from 3, except where an evolution lands.
export const ITEM_EVERY = 3;
export const ITEM_FROM = 3;

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

// ---- The level curve ----

// XP to go from `level` to the next one.
export function levelCost(level) {
  return LEVEL_BASE + LEVEL_STEP * (level - 1);
}

// Total XP needed to reach `level` from scratch.
export function xpForLevel(level) {
  let total = 0;
  for (let n = 1; n < level; n++) total += levelCost(n);
  return total;
}

export function levelFromXp(xp) {
  let level = 1;
  let spent = 0;
  while (spent + levelCost(level) <= xp) {
    spent += levelCost(level);
    level++;
  }
  return level;
}

export function formForLevel(level) {
  let form = 0;
  FORM_LEVELS.forEach((min, i) => {
    if (level >= min) form = i;
  });
  return form;
}

// True when reaching this level hands over a piece of furniture. Evolution
// levels give a new form instead, so they never double up.
export function grantsItem(level) {
  if (FORM_LEVELS.includes(level)) return false;
  return level >= ITEM_FROM && (level - ITEM_FROM) % ITEM_EVERY === 0;
}

// ---- Replaying the history ----

// Live and retired habits both feed experience. Retiring rather than deleting
// is what keeps a level from falling when a habit is removed.
function allHabits(save) {
  return [...save.habits, ...(save.retired ?? [])];
}

function firstDay(save) {
  const days = allHabits(save).map((h) => h.createdOn).sort();
  return days[0] ?? null;
}

// Walks every day from the first habit's creation through today, accumulating
// experience and settling health. Health only moves on finished days, except
// that logging something today restores a point right away so the monster
// perks up the moment it is fed.
export function replay(save, today) {
  const start = firstDay(save);
  let xp = 0;
  let health = MAX_HEALTH;
  if (!start) return { xp, health };

  const habits = allHabits(save);
  for (let day = start; day <= today; day = addDays(day, 1)) {
    const scheduled = habits.filter((h) => h.createdOn <= day);
    if (!scheduled.length) continue;
    const logged = scheduled.filter((h) => day in h.logs);

    if (logged.length) {
      let gain = Math.round((DAY_BASE * logged.length) / scheduled.length);
      if (health === MAX_HEALTH) gain += HEALTH_BONUS;
      const breadth = scheduled.length >= 2 && logged.length >= 2;
      if (breadth && levelFromXp(xp) >= BREADTH_MIN_LEVEL) gain += BREADTH_BONUS;
      xp += Math.min(gain, MAX_DAY_XP);
      health = Math.min(MAX_HEALTH, health + 1);
    } else if (day < today) {
      // An unlogged today costs nothing until the day is over.
      health = Math.max(0, health - 1);
    }
  }
  return { xp, health };
}

export function statTotals(save) {
  const totals = Object.fromEntries(STATS.map((s) => [s, 0]));
  for (const habit of allHabits(save)) {
    if (!STATS.includes(habit.stat)) continue;
    totals[habit.stat] += Object.keys(habit.logs).length;
  }
  return totals;
}

export function activeMonster(save) {
  return save.monsters.find((m) => m.id === save.activeMonster) ?? null;
}

// The monster hatches out of its egg on the first habit ever logged.
export function hasHatched(save) {
  return allHabits(save).some((h) => Object.keys(h.logs).length > 0);
}

// Everything the screen needs in one object.
export function monsterState(save, today) {
  const monster = activeMonster(save);
  const { xp, health } = replay(save, today);
  const level = levelFromXp(xp);
  return {
    species: monster?.species ?? null,
    hatched: hasHatched(save),
    xp,
    level,
    form: formForLevel(level),
    intoLevel: xp - xpForLevel(level),
    levelNeeds: levelCost(level),
    health,
    wornOut: health === 0,
    stats: statTotals(save),
  };
}

// ---- Changes (each returns a new save object) ----

export function emptySave() {
  return {
    version: SAVE_VERSION,
    monsters: [],
    activeMonster: null,
    habits: [],
    retired: [],
    lastBackupAt: null,
  };
}

function newId(prefix, random) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
}

export function chooseStarter(save, species, today, random = Math.random) {
  if (!STARTERS.includes(species)) throw new Error(`"${species}" is not one of the starters.`);
  const monster = { id: newId('m', random), species, chosenOn: today };
  return { ...save, monsters: [...save.monsters, monster], activeMonster: monster.id };
}

export function freeSlots(save) {
  const used = new Set(save.habits.map((h) => h.slot));
  return [0, 1, 2].filter((s) => !used.has(s));
}

export function addHabit(save, { name, type, unit, stat }, today, random = Math.random) {
  const slot = freeSlots(save)[0];
  if (slot === undefined) throw new Error('There is already room for no more habits.');
  if (stat != null && !STATS.includes(stat)) throw new Error(`"${stat}" is not a stat.`);
  const habit = {
    id: newId('h', random),
    slot,
    name: name.trim(),
    type,
    unit: type === 'number' ? (unit || '').trim() : '',
    // Habits made before the first evolution are asked for a stat later.
    stat: stat ?? null,
    createdOn: today,
    logs: {},
  };
  return { ...save, habits: [...save.habits, habit] };
}

function updateHabit(save, id, change) {
  return { ...save, habits: save.habits.map((h) => (h.id === id ? change(h) : h)) };
}

// For number habits `value` is the number; for yes/no habits it's true.
export function logToday(save, id, today, value = true) {
  return updateHabit(save, id, (h) => ({ ...h, logs: { ...h.logs, [today]: value } }));
}

export function undoToday(save, id, today) {
  return updateHabit(save, id, (h) => {
    const logs = { ...h.logs };
    delete logs[today];
    return { ...h, logs };
  });
}

export function renameHabit(save, id, name) {
  return updateHabit(save, id, (h) => ({ ...h, name: name.trim() }));
}

export function setStat(save, id, stat) {
  if (!STATS.includes(stat)) throw new Error(`"${stat}" is not a stat.`);
  return updateHabit(save, id, (h) => ({ ...h, stat }));
}

// Retires rather than deletes. The card disappears, but the logs stay so the
// level never falls and past breadth bonuses are not rewritten.
export function deleteHabit(save, id) {
  const habit = save.habits.find((h) => h.id === id);
  if (!habit) return save;
  const retired = { id: habit.id, name: habit.name, stat: habit.stat, createdOn: habit.createdOn, logs: habit.logs };
  return {
    ...save,
    habits: save.habits.filter((h) => h.id !== id),
    retired: [...(save.retired ?? []), retired],
  };
}

export function latestValue(habit) {
  const days = Object.keys(habit.logs).sort();
  if (!days.length) return null;
  const day = days[days.length - 1];
  return { day, value: habit.logs[day] };
}

// Consecutive logged days ending today, or ending yesterday if today is not
// logged yet, so an unfinished today never looks like a broken streak.
export function currentStreak(habit, today) {
  let day = today in habit.logs ? today : addDays(today, -1);
  let streak = 0;
  while (day in habit.logs) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

// ---- Backup validation ----

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function validLogs(logs) {
  return logs && typeof logs === 'object' && Object.keys(logs).every((k) => DATE_KEY.test(k));
}

export function validateSave(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) {
    throw new Error('This file is not a Habit Monster backup.');
  }
  if (!Array.isArray(data.monsters)) {
    throw new Error(
      data.version === 1
        ? 'This is a Micro-Habit Garden backup. Habit Monster cannot read it.'
        : 'This file is not a Habit Monster backup.',
    );
  }
  if (data.habits.length > MAX_HABITS) throw new Error('A backup can hold at most 3 habits.');

  for (const m of data.monsters) {
    const ok =
      typeof m.id === 'string' &&
      STARTERS.includes(m.species) &&
      DATE_KEY.test(m.chosenOn);
    // Saves from before experience became purely derived carry a levelFloor.
    // It is ignored rather than rejected, so an older backup still loads.
    if (!ok) throw new Error('A monster in the backup is malformed.');
  }

  for (const h of data.habits) {
    const ok =
      typeof h.id === 'string' &&
      typeof h.name === 'string' &&
      [0, 1, 2].includes(h.slot) &&
      ['check', 'number'].includes(h.type) &&
      (h.stat === null || STATS.includes(h.stat)) &&
      DATE_KEY.test(h.createdOn) &&
      validLogs(h.logs);
    if (!ok) throw new Error(`Habit "${h.name ?? '?'}" in the backup is malformed.`);
  }

  const retired = Array.isArray(data.retired) ? data.retired : [];
  for (const r of retired) {
    const ok = typeof r.id === 'string' && DATE_KEY.test(r.createdOn) && validLogs(r.logs);
    if (!ok) throw new Error('A retired habit in the backup is malformed.');
  }

  return {
    version: SAVE_VERSION,
    monsters: data.monsters,
    activeMonster: data.activeMonster ?? data.monsters[0]?.id ?? null,
    habits: data.habits,
    retired,
    lastBackupAt: data.lastBackupAt ?? null,
  };
}

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
export const MAX_NAME = 16;
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

// Every level gained raises every stat by this much, on top of the point a
// stat gets each time its habit is logged. It keeps a stat whose habit does
// not exist from sitting at zero forever, and gives every level something
// visible to do, not just the levels that bring furniture.
export const STAT_PER_LEVEL = 1;

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

// A treat, once a day. Deliberately small next to a day's habits, so the
// monster still grows mostly because he did the things. It sits outside the
// daily cap, or it would be worth nothing on exactly the days he did
// everything, and it is not gated on having logged anything, or the one
// button that might draw him in would be disabled when it is needed most.
export const FEED_XP = 5;

// Furniture for the room, one piece at each of these levels. An explicit list
// rather than a rule, so nothing can claim a level grants an item that does
// not exist. Every third level from 3, skipping 15 where the evolution lands.
export const FURNITURE = [
  { level: 3, id: 'picture', label: 'A picture for the wall' },
  { level: 6, id: 'shelf', label: 'A shelf of books' },
  { level: 9, id: 'lamp', label: 'A floor lamp' },
  { level: 12, id: 'chest', label: 'A toy chest' },
  { level: 18, id: 'clock', label: 'A wall clock' },
  { level: 21, id: 'plant', label: 'A big leafy plant' },
  { level: 24, id: 'trophy', label: 'A trophy, on the toy chest' },
];

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

// True when reaching this level hands over a piece of furniture.
export function grantsItem(level) {
  return FURNITURE.some((item) => item.level === level);
}

// The furniture in the room at a given level, in the order it arrived.
export function furnitureAt(level) {
  return FURNITURE.filter((item) => item.level <= level);
}

// Every milestone, built from the same constants the game runs on, so the
// events chart cannot describe something the game does not do.
export function levelEvents() {
  const events = [
    { level: 1, kind: 'hatch', label: 'The egg hatches, on the first habit logged' },
    { level: FORM_LEVELS[1], kind: 'evolve', label: `Evolves into its ${FORM_LABELS[1].toLowerCase()} form` },
    { level: FORM_LEVELS[1], kind: 'stats', label: 'Stats appear, and each habit is asked what it trains' },
    { level: BREADTH_MIN_LEVEL, kind: 'bonus', label: 'Breadth bonus: +5 XP a day for logging 2 or more habits' },
    { level: FORM_LEVELS[2], kind: 'evolve', label: `Evolves into its ${FORM_LABELS[2].toLowerCase()} form` },
    ...FURNITURE.map((item) => ({ level: item.level, kind: 'furniture', id: item.id, label: item.label })),
  ];
  const order = { hatch: 0, evolve: 1, stats: 2, bonus: 3, furniture: 4 };
  return events.sort((a, b) => a.level - b.level || order[a.kind] - order[b.kind]);
}

// A typical day for planning, below the 35 to 40 of a perfect one.
export const TYPICAL_DAY_XP = 28;

// Every event with when it can be expected. `earliestDay` is found by actually
// playing: every habit logged every day, through this same engine, so it can
// never disagree with the game. `typicalDay` assumes TYPICAL_DAY_XP.
export function eventSchedule() {
  const events = levelEvents();
  const top = Math.max(...events.map((e) => e.level));
  const start = '2026-01-01';
  let save = chooseStarter(emptySave(), STARTERS[0], start, () => 0.5);
  for (let i = 0; i < MAX_HABITS; i++) {
    save = addHabit(save, { name: `Habit ${i}`, type: 'check' }, start, () => (i + 1) / 10);
  }
  const earliest = { 1: 1 };
  for (let day = 1; !(top in earliest) && day <= 1000; day++) {
    const key = addDays(start, day - 1);
    for (const habit of save.habits) save = logToday(save, habit.id, key);
    // Doing everything includes the daily treat.
    save = feedMonster(save, save.activeMonster, key);
    const { level } = monsterState(save, key);
    for (let l = 2; l <= level; l++) if (!(l in earliest)) earliest[l] = day;
  }
  return events.map((event) => ({
    ...event,
    xp: xpForLevel(event.level),
    earliestDay: earliest[event.level],
    typicalDay: event.level === 1 ? 1 : Math.ceil(xpForLevel(event.level) / TYPICAL_DAY_XP),
  }));
}

// ---- Days away ----
//
// Stretches when he is travelling. A day away with nothing logged is skipped
// rather than missed: it breaks no streak and costs no health. A day away
// with something logged counts as normal. And while away, logging any one
// habit opens the game that same day.
//
// Everything is derived from the logs, so adding a stretch after the fact
// mends the streaks it covers the next time the app opens.
export const AWAY = [
  { from: '2026-10-03', to: '2026-10-08' }, // theme-park trip
];

export function isAwayDay(day, away = AWAY) {
  return away.some((stretch) => stretch.from <= day && day <= stretch.to);
}

// ---- Free play ----
//
// The game opens on any day after a finished one. Two of his habits happen
// at bedtime, so a rule about today would unlock the game just as he went to
// sleep: finishing tonight opens tomorrow instead.

// At least one habit was part of the day, and every one of them was logged.
// Without "at least one", a save with no habits would be finished every day.
export function isFinishedDay(save, day) {
  const scheduled = scheduledOn(save, day);
  return scheduled.length > 0 && scheduled.every((h) => day in h.logs);
}

export function freePlayOn(save, day, away = AWAY) {
  if (isFinishedDay(save, addDays(day, -1))) return true;
  return isAwayDay(day, away) && scheduledOn(save, day).some((h) => day in h.logs);
}

// How today is going, for the line under the Play button: whether tomorrow
// will be free play. `retiredUnlogged` counts habits deleted today without
// being logged, which still count for today and would otherwise make "2 of 3"
// look wrong with only two cards on screen.
export function todaysProgress(save, today) {
  const scheduled = scheduledOn(save, today);
  const done = scheduled.filter((h) => today in h.logs).length;
  const live = new Set(save.habits.map((h) => h.id));
  const retiredUnlogged = scheduled.filter((h) => !live.has(h.id) && !(today in h.logs)).length;
  return { done, total: scheduled.length, finished: isFinishedDay(save, today), retiredUnlogged };
}

// The game's one stored record. It lives on the monster, like its name, so
// each one in the backpack keeps its own. Stored as a share of the board, so
// it still means something if the board size changes.
//
// Three records: the best ever, the best today (since 100% made the best ever
// stop moving), and the fastest win in seconds of play. A round that was not
// won passes no seconds.
export function recordRound(save, id, { percent, day, seconds = null }) {
  const held = Math.round(percent * 10) / 10;
  const time = seconds === null ? null : Math.round(seconds * 10) / 10;
  return {
    ...save,
    monsters: save.monsters.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m };
      if (held > (m.bestScore ?? 0)) next.bestScore = held;
      if (m.bestToday?.day !== day || held > m.bestToday.percent) next.bestToday = { day, percent: held };
      if (time !== null && !(m.fastestWin <= time)) next.fastestWin = time;
      return next;
    }),
  };
}

// The records as the end of a round shows them. Today's best is null on a day
// with no rounds yet, and the fastest win is null until he has won.
export function gameRecords(monster, day) {
  return {
    best: monster?.bestScore ?? 0,
    today: monster?.bestToday?.day === day ? monster.bestToday.percent : null,
    fastestWin: monster?.fastestWin ?? null,
  };
}

// ---- Replaying the history ----

// Live and retired habits both feed experience. Retiring rather than deleting
// is what keeps a level from falling when a habit is removed.
function allHabits(save) {
  return [...save.habits, ...(save.retired ?? [])];
}

// The last day a retired habit was still part of the day's work, or null if
// it never was. Deleting records it: the deletion day itself still counts, so
// logging two of three and deleting the third does not make the day finished.
// Habits retired before that date was recorded fall back to their last log —
// the earliest it could have been deleted, and so the most generous guess —
// and one never logged at all is treated as never having been scheduled.
function retiredThrough(habit) {
  if (habit.retiredOn) return habit.retiredOn;
  const days = Object.keys(habit.logs).sort();
  return days.length ? days[days.length - 1] : null;
}

// The habits that were part of a given day: created on or before it, and not
// yet retired. Without the retired check a deleted habit stayed scheduled
// forever, so every perfect day after a deletion was scored as a missed one.
export function scheduledOn(save, day) {
  const live = save.habits.filter((h) => h.createdOn <= day);
  const retired = (save.retired ?? []).filter((h) => {
    if (h.createdOn > day) return false;
    const until = retiredThrough(h);
    return until !== null && day <= until;
  });
  return [...live, ...retired];
}

function firstDay(save) {
  const days = allHabits(save).map((h) => h.createdOn).sort();
  return days[0] ?? null;
}

// Walks every day from the first habit's creation through today, accumulating
// experience and settling health. Health only moves on finished days, except
// that logging something today restores a point right away so the monster
// perks up the moment it is fed.
export function replay(save, today, away = AWAY) {
  const start = firstDay(save);
  let xp = 0;
  let health = MAX_HEALTH;
  if (!start) return { xp, health };

  for (let day = start; day <= today; day = addDays(day, 1)) {
    const scheduled = scheduledOn(save, day);
    if (!scheduled.length) continue;
    const logged = scheduled.filter((h) => day in h.logs);

    if (logged.length) {
      let gain = Math.round((DAY_BASE * logged.length) / scheduled.length);
      if (health === MAX_HEALTH) gain += HEALTH_BONUS;
      const breadth = scheduled.length >= 2 && logged.length >= 2;
      if (breadth && levelFromXp(xp) >= BREADTH_MIN_LEVEL) gain += BREADTH_BONUS;
      xp += Math.min(gain, MAX_DAY_XP);
      health = Math.min(MAX_HEALTH, health + 1);
    } else if (day < today && !isAwayDay(day, away)) {
      // An unlogged today costs nothing until the day is over, and nor does
      // a day away.
      health = Math.max(0, health - 1);
    }
  }
  return { xp, health };
}

// Stats are the levels gained plus a point for each day the habit that
// trains them was logged. Changing a habit's stat moves its whole history,
// since nothing is stored per day: that is what makes fixing a mistake work.
export function statTotals(save, level = 1) {
  const fromLevels = (level - 1) * STAT_PER_LEVEL;
  const totals = Object.fromEntries(STATS.map((s) => [s, fromLevels]));
  for (const habit of allHabits(save)) {
    if (!STATS.includes(habit.stat)) continue;
    totals[habit.stat] += Object.keys(habit.logs).length;
  }
  return totals;
}

// Treats are recorded per day, like habit logs, so the total is derived and
// feeding twice in a day is impossible rather than merely discouraged.
export function fedDays(save) {
  return activeMonster(save)?.fed ?? {};
}

export function hasFedToday(save, today) {
  return today in fedDays(save);
}

export function feedMonster(save, id, today) {
  return {
    ...save,
    monsters: save.monsters.map((m) => (m.id === id ? { ...m, fed: { ...m.fed, [today]: true } } : m)),
  };
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
  const { xp: fromHabits, health } = replay(save, today);
  // Treats are added outside the replay: they earn a flat amount and touch
  // nothing else, so there is no need to walk them day by day.
  const xp = fromHabits + Object.keys(monster?.fed ?? {}).length * FEED_XP;
  const level = levelFromXp(xp);
  return {
    species: monster?.species ?? null,
    // The name he gave it, if any. The species name is the fallback, and
    // stays on show underneath either way: he invented these creatures.
    name: monster?.name ?? null,
    hatched: hasHatched(save),
    xp,
    level,
    form: formForLevel(level),
    intoLevel: xp - xpForLevel(level),
    levelNeeds: levelCost(level),
    health,
    wornOut: health === 0,
    stats: statTotals(save, level),
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

// Names belong to the monster, not the save, so when the backpack arrives
// each of the three keeps its own. An empty name clears it back to the
// species name.
export function nameMonster(save, id, name) {
  const clean = String(name ?? '').trim().slice(0, MAX_NAME);
  return {
    ...save,
    monsters: save.monsters.map((m) => {
      if (m.id !== id) return m;
      const next = { ...m };
      if (clean) next.name = clean;
      else delete next.name;
      return next;
    }),
  };
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
export function deleteHabit(save, id, today) {
  const habit = save.habits.find((h) => h.id === id);
  if (!habit) return save;
  if (!DATE_KEY.test(today ?? '')) throw new Error('deleteHabit needs today, to record when it was retired.');
  const retired = {
    id: habit.id,
    name: habit.name,
    stat: habit.stat,
    createdOn: habit.createdOn,
    retiredOn: today,
    logs: habit.logs,
  };
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
// logged yet, so an unfinished today never looks like a broken streak. Days
// away are stepped over when unlogged: they neither count nor break it.
export function currentStreak(habit, today, away = AWAY) {
  let day = today in habit.logs ? today : addDays(today, -1);
  let streak = 0;
  for (;;) {
    if (day in habit.logs) streak++;
    else if (!isAwayDay(day, away)) break;
    day = addDays(day, -1);
  }
  return streak;
}

// ---- Backup validation ----

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isShare = (n) => typeof n === 'number' && n >= 0 && n <= 100;

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
      DATE_KEY.test(m.chosenOn) &&
      (m.name === undefined || (typeof m.name === 'string' && m.name.length <= MAX_NAME)) &&
      (m.fed === undefined || validLogs(m.fed)) &&
      (m.bestScore === undefined || isShare(m.bestScore)) &&
      (m.bestToday === undefined || (DATE_KEY.test(m.bestToday?.day) && isShare(m.bestToday.percent))) &&
      (m.fastestWin === undefined || (typeof m.fastestWin === 'number' && m.fastestWin > 0));
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
    const ok =
      typeof r.id === 'string' &&
      DATE_KEY.test(r.createdOn) &&
      (r.retiredOn === undefined || DATE_KEY.test(r.retiredOn)) &&
      validLogs(r.logs);
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

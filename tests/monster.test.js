import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_BASE, MAX_HEALTH, STARTERS,
  levelCost, xpForLevel, levelFromXp, formForLevel, grantsItem,
  addDays, replay, monsterState, statTotals, withLevelFloor,
  emptySave, chooseStarter, addHabit, logToday, undoToday, deleteHabit,
  setStat, currentStreak, hasHatched, validateSave,
} from '../js/monster.js';

const DAY1 = '2026-01-01';
const day = (n) => addDays(DAY1, n - 1);

// Builds a save with `count` habits, all created on day 1, and a starter picked.
function saveWith(count, stats = []) {
  let save = chooseStarter(emptySave(), 'embertail', DAY1, () => 0.5);
  for (let i = 0; i < count; i++) {
    save = addHabit(save, { name: `Habit ${i}`, type: 'check', stat: stats[i] ?? null }, DAY1, () => i / 10);
  }
  return save;
}

// Logs habits `which` (by index) on each of days 1..days.
function logDays(save, days, which = null) {
  for (let d = 1; d <= days; d++) {
    save.habits.forEach((h, i) => {
      if (which === null || which.includes(i)) save = logToday(save, h.id, day(d));
    });
  }
  return save;
}

// ---- The level curve ----

test('a level costs 8 more than the one before it', () => {
  assert.equal(levelCost(1), LEVEL_BASE);
  assert.deepEqual([1, 2, 3, 4].map(levelCost), [35, 43, 51, 59]);
  assert.equal(levelCost(14), 139);
});

test('the curve hits the pacing it was tuned for', () => {
  // Level 5 around day 7 and level 15 around day 44 at a realistic 28 XP/day.
  assert.equal(xpForLevel(5), 188);
  assert.equal(xpForLevel(15), 1218);
  assert.equal(Math.ceil(xpForLevel(5) / 28), 7);
  assert.equal(Math.ceil(xpForLevel(15) / 28), 44);
  assert.equal(Math.ceil(xpForLevel(15) / 40), 31);
});

test('levelFromXp is the inverse of xpForLevel', () => {
  for (let level = 1; level <= 30; level++) {
    assert.equal(levelFromXp(xpForLevel(level)), level);
    assert.equal(levelFromXp(xpForLevel(level) - 1), level - 1 || 1);
  }
});

test('forms change at levels 5 and 15', () => {
  assert.deepEqual([1, 4].map(formForLevel), [0, 0]);
  assert.deepEqual([5, 14].map(formForLevel), [1, 1]);
  assert.deepEqual([15, 30].map(formForLevel), [2, 2]);
});

test('furniture arrives every third level, never on an evolution', () => {
  const granted = [];
  for (let level = 1; level <= 25; level++) if (grantsItem(level)) granted.push(level);
  assert.deepEqual(granted, [3, 6, 9, 12, 18, 21, 24]);
  assert.equal(grantsItem(5), false, 'level 5 gives an evolution instead');
  assert.equal(grantsItem(15), false, 'level 15 gives an evolution instead');
});

// ---- Experience ----

test('a perfect day is 40 XP whether there is 1 habit or 3', () => {
  const one = replay(logDays(saveWith(1), 1), day(1));
  const three = replay(logDays(saveWith(3), 1), day(1));
  assert.equal(one.xp, three.xp, 'habit count must not change leveling speed');
  assert.equal(one.xp, 35, '30 base plus the 5 full-health bonus');
});

test('a partial day pays a share of the base', () => {
  const save = saveWith(3);
  const one = replay(logToday(save, save.habits[0].id, DAY1), DAY1);
  assert.equal(one.xp, 15, '30 x 1/3 is 10, plus the 5 health bonus');
  const two = replay(logToday(logToday(save, save.habits[0].id, DAY1), save.habits[1].id, DAY1), DAY1);
  assert.equal(two.xp, 25, '30 x 2/3 is 20, plus the 5 health bonus');
});

test('the full-health bonus stops once health has slipped', () => {
  let save = saveWith(1);
  save = logToday(save, save.habits[0].id, day(1));
  save = logToday(save, save.habits[0].id, day(4));
  const { xp, health } = replay(save, day(4));
  // Day 1 pays 35. Days 2 and 3 are missed, dropping health to 3. Day 4 pays
  // the bare 30, then restores a point.
  assert.equal(xp, 65);
  assert.equal(health, 4);
});

test('the breadth bonus only starts at level 5', () => {
  const two = replay(logDays(saveWith(2), 10), day(10));
  // 35 a day until the level 5 threshold at 188 XP is crossed, then 40.
  assert.equal(two.xp, 370);
  const one = replay(logDays(saveWith(1), 10), day(10));
  assert.equal(one.xp, 350, 'a single habit never earns the breadth bonus');
});

test('a day can never be worth more than 40', () => {
  const save = logDays(saveWith(3), 30);
  const { xp } = replay(save, day(30));
  assert.ok(xp <= 40 * 30);
  // Days 1-6 pay 35 before level 5, the remaining 24 pay the capped 40.
  assert.equal(xp, 35 * 6 + 40 * 24);
});

test('an unlogged today costs nothing until the day is over', () => {
  const save = logDays(saveWith(1), 1);
  assert.equal(replay(save, day(1)).health, MAX_HEALTH);
  assert.equal(replay(save, day(2)).health, MAX_HEALTH, 'today has not finished yet');
  assert.equal(replay(save, day(3)).health, MAX_HEALTH - 1, 'day 2 finished unlogged');
});

test('health drains to zero and the monster reads as worn out', () => {
  const save = logDays(saveWith(1), 1);
  const state = monsterState(save, day(8));
  assert.equal(state.health, 0);
  assert.equal(state.wornOut, true);
});

test('health recovers a point a day and stops at full', () => {
  let save = saveWith(1);
  save = logToday(save, save.habits[0].id, day(1));
  for (let d = 6; d <= 12; d++) save = logToday(save, save.habits[0].id, day(d));
  assert.equal(replay(save, day(12)).health, MAX_HEALTH);
});

// ---- Levels are never taken away ----

test('deleting a habit retires it, so the level does not fall', () => {
  const save = logDays(saveWith(1), 10);
  const before = monsterState(save, day(10));
  assert.equal(before.xp, 350);

  const after = monsterState(deleteHabit(save, save.habits[0].id), day(10));
  assert.equal(after.xp, before.xp, 'retired logs still feed experience');
  assert.equal(after.level, before.level);
  assert.equal(deleteHabit(save, save.habits[0].id).habits.length, 0, 'the card is gone');
});

test('a retired habit keeps its stat contribution', () => {
  const save = logDays(saveWith(1, ['wisdom']), 4);
  const retired = deleteHabit(save, save.habits[0].id);
  assert.equal(statTotals(retired).wisdom, 4);
});

test('levelFloor holds the level up if the curve is ever retuned', () => {
  let save = logDays(saveWith(1), 1);
  save = withLevelFloor(save, day(1));
  assert.equal(save.monsters[0].levelFloor, 2, '35 XP is exactly level 2');

  // Pretend a retune made the same history worth less.
  const floored = { ...save, monsters: [{ ...save.monsters[0], levelFloor: 9 }] };
  assert.equal(monsterState(floored, day(1)).level, 9);
  assert.equal(monsterState(floored, day(1)).form, 1, 'the form follows the floored level');
});

test('the bar always measures the level that is on screen', () => {
  // Undoing a log drops experience below the floor. Flooring only the level
  // left the bar measuring the level below the one shown, so filling it
  // appeared to do nothing: it reset without the level going up.
  let save = saveWith(3);
  save.habits.forEach((h) => { save = logToday(save, h.id, DAY1); });
  save = withLevelFloor(save, DAY1);
  const full = monsterState(save, DAY1);
  assert.equal(full.level, 2, '30 base plus the health bonus is exactly level 2');
  assert.equal(full.levelNeeds, levelCost(2));

  save = undoToday(save, save.habits[0].id, DAY1);
  save = undoToday(save, save.habits[1].id, DAY1);
  const after = monsterState(save, DAY1);
  assert.equal(after.level, full.level, 'the floor holds the level');
  assert.equal(after.levelNeeds, levelCost(after.level), 'and the bar measures that same level');
  assert.equal(after.xp - after.intoLevel, xpForLevel(after.level));
});

test('level, bar and experience agree in every state', () => {
  let save = saveWith(2);
  for (let d = 1; d <= 20; d++) {
    // Log, sometimes undo, and check the invariant after every change.
    save.habits.forEach((h) => { save = logToday(save, h.id, day(d)); });
    if (d % 3 === 0) save = undoToday(save, save.habits[0].id, day(d));
    save = withLevelFloor(save, day(d));
    const s = monsterState(save, day(d));
    assert.equal(s.level, levelFromXp(s.xp), `day ${d}: level matches experience`);
    assert.equal(s.intoLevel, s.xp - xpForLevel(s.level), `day ${d}: bar position`);
    assert.equal(s.levelNeeds, levelCost(s.level), `day ${d}: bar length`);
    assert.ok(s.intoLevel < s.levelNeeds, `day ${d}: bar is never past full`);
  }
});

test('withLevelFloor never lowers the floor', () => {
  let save = logDays(saveWith(1), 10);
  save = { ...save, monsters: [{ ...save.monsters[0], levelFloor: 99 }] };
  assert.equal(withLevelFloor(save, day(10)).monsters[0].levelFloor, 99);
});

// ---- Stats ----

test('each logged day raises the habit stat by one', () => {
  const save = logDays(saveWith(2, ['wisdom', 'speed']), 3);
  assert.deepEqual(statTotals(save), { strength: 0, speed: 3, wisdom: 3, charisma: 0 });
});

test('a habit with no stat yet contributes nothing', () => {
  const save = logDays(saveWith(1), 3);
  assert.deepEqual(statTotals(save), { strength: 0, speed: 0, wisdom: 0, charisma: 0 });
  const named = setStat(save, save.habits[0].id, 'charisma');
  assert.equal(statTotals(named).charisma, 3, 'the back history counts once a stat is picked');
});

test('setStat rejects a stat that does not exist', () => {
  const save = saveWith(1);
  assert.throws(() => setStat(save, save.habits[0].id, 'heart'), /not a stat/);
});

// ---- Hatching and habits ----

test('the egg hatches on the first log, not on choosing a starter', () => {
  const save = saveWith(1);
  assert.equal(hasHatched(save), false);
  assert.equal(hasHatched(logDays(save, 1)), true);
});

test('choosing a starter sets it active', () => {
  const save = chooseStarter(emptySave(), 'bubbletide', DAY1, () => 0.5);
  assert.equal(monsterState(save, DAY1).species, 'bubbletide');
  assert.equal(save.activeMonster, save.monsters[0].id);
  assert.throws(() => chooseStarter(emptySave(), 'pikachu', DAY1), /not one of the starters/);
  assert.equal(STARTERS.length, 3);
});

test('a fourth habit is refused', () => {
  const save = saveWith(3);
  assert.throws(() => addHabit(save, { name: 'Four', type: 'check' }, DAY1), /no more habits/);
});

test('undoing today removes only today', () => {
  const save = logDays(saveWith(1), 3);
  const undone = undoToday(save, save.habits[0].id, day(3));
  assert.deepEqual(Object.keys(undone.habits[0].logs), [day(1), day(2)]);
});

test('a streak survives an unlogged today', () => {
  const save = logDays(saveWith(1), 3);
  assert.equal(currentStreak(save.habits[0], day(3)), 3);
  assert.equal(currentStreak(save.habits[0], day(4)), 3, 'today is not over yet');
  assert.equal(currentStreak(save.habits[0], day(5)), 0, 'day 4 was missed');
});

test('an empty save has no monster and no experience', () => {
  const state = monsterState(emptySave(), DAY1);
  assert.equal(state.species, null);
  assert.equal(state.xp, 0);
  assert.equal(state.level, 1);
  assert.equal(state.health, MAX_HEALTH);
});

// ---- Backups ----

test('a valid save round-trips through validateSave', () => {
  const save = logDays(saveWith(2, ['speed', 'wisdom']), 3);
  const back = validateSave(JSON.parse(JSON.stringify(save)));
  assert.equal(back.habits.length, 2);
  assert.equal(back.monsters.length, 1);
  assert.equal(monsterState(back, day(3)).xp, monsterState(save, day(3)).xp);
});

test('a garden backup is rejected by name', () => {
  const garden = { version: 1, habits: [], lastBackupAt: null };
  assert.throws(() => validateSave(garden), /Micro-Habit Garden backup/);
});

test('validateSave rejects malformed backups', () => {
  assert.throws(() => validateSave(null), /not a Habit Monster backup/);
  assert.throws(() => validateSave({ monsters: [], habits: {} }), /not a Habit Monster backup/);
  assert.throws(
    () => validateSave({ monsters: [{ id: 'm', species: 'ghost', chosenOn: DAY1, levelFloor: 1 }], habits: [] }),
    /monster in the backup is malformed/,
  );
  const habit = { id: 'h', name: 'x', slot: 0, type: 'check', stat: 'speed', createdOn: DAY1, logs: {} };
  assert.throws(() => validateSave({ monsters: [], habits: [{ ...habit, stat: 'heart' }] }), /malformed/);
  assert.throws(() => validateSave({ monsters: [], habits: [{ ...habit, logs: { nope: true } }] }), /malformed/);
  assert.throws(
    () => validateSave({ monsters: [], habits: [habit, habit, habit, habit] }),
    /at most 3 habits/,
  );
});

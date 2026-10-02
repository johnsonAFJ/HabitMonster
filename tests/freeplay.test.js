import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, emptySave, chooseStarter, addHabit, logToday, undoToday, deleteHabit,
  isFinishedDay, freePlayOn, todaysProgress, recordScore, validateSave,
} from '../js/monster.js';

const DAY1 = '2026-01-01';
const day = (n) => addDays(DAY1, n - 1);

function saveWith(count, type = 'check') {
  let save = chooseStarter(emptySave(), 'embertail', DAY1, () => 0.5);
  for (let i = 0; i < count; i++) {
    save = addHabit(save, { name: `Habit ${i}`, type }, DAY1, () => (i + 1) / 10);
  }
  return save;
}

const logAll = (save, d, value = true) => save.habits.reduce((s, h) => logToday(s, h.id, d, value), save);

test('finishing every habit opens the game the next day', () => {
  const save = logAll(saveWith(3), day(1));
  assert.equal(isFinishedDay(save, day(1)), true);
  assert.equal(freePlayOn(save, day(2)), true, 'free play the day after');
  assert.equal(freePlayOn(save, day(1)), false, 'not the same day: the habits are at bedtime');
  assert.equal(freePlayOn(save, day(3)), false, 'and only for one day');
});

test('two of three is not finished', () => {
  let save = saveWith(3);
  save = logToday(save, save.habits[0].id, day(1));
  save = logToday(save, save.habits[1].id, day(1));
  assert.equal(isFinishedDay(save, day(1)), false);
  assert.equal(freePlayOn(save, day(2)), false);
});

test('a day with no habits at all is not finished', () => {
  // Otherwise a save with nothing in it would have free play every day.
  const save = chooseStarter(emptySave(), 'embertail', DAY1, () => 0.5);
  assert.equal(isFinishedDay(save, day(1)), false);
  assert.equal(freePlayOn(save, day(2)), false);
});

test('there is no free play on the first day', () => {
  const save = logAll(saveWith(2), day(1));
  assert.equal(freePlayOn(save, day(1)), false, 'there was no yesterday to finish');
});

test('deleting the habit he skipped does not open the game', () => {
  let save = saveWith(3);
  save = logToday(save, save.habits[0].id, day(1));
  save = logToday(save, save.habits[1].id, day(1));
  save = deleteHabit(save, save.habits[2].id, day(1));
  assert.equal(isFinishedDay(save, day(1)), false, 'the deleted one still counts that day');
  assert.equal(freePlayOn(save, day(2)), false);
});

test('deleting a habit does not lock him out afterwards', () => {
  // The bug this rule depended on: a deleted habit used to stay scheduled
  // forever, so no day could ever be finished again.
  let save = logAll(saveWith(3), day(1));
  save = deleteHabit(save, save.habits[2].id, day(1));
  save = logAll(save, day(2));
  assert.equal(isFinishedDay(save, day(2)), true);
  assert.equal(freePlayOn(save, day(3)), true);
});

test('a habit added late in the day has to be logged too', () => {
  let save = logAll(saveWith(2), day(1));
  save = addHabit(save, { name: 'New', type: 'check' }, day(1), () => 0.9);
  assert.equal(isFinishedDay(save, day(1)), false, 'added today, so it counts today');
});

test('a number habit counts as soon as any value is logged', () => {
  const save = logAll(saveWith(1, 'number'), day(1), 62.5);
  assert.equal(isFinishedDay(save, day(1)), true);
});

test('undoing a log takes the free play back', () => {
  let save = logAll(saveWith(2), day(1));
  assert.equal(freePlayOn(save, day(2)), true);
  save = undoToday(save, save.habits[0].id, day(1));
  assert.equal(freePlayOn(save, day(2)), false);
});

test('progress counts toward tomorrow', () => {
  let save = saveWith(3);
  assert.deepEqual(todaysProgress(save, day(1)), { done: 0, total: 3, finished: false, retiredUnlogged: 0 });
  save = logToday(save, save.habits[0].id, day(1));
  save = logToday(save, save.habits[1].id, day(1));
  assert.deepEqual(todaysProgress(save, day(1)), { done: 2, total: 3, finished: false, retiredUnlogged: 0 });
  save = logToday(save, save.habits[2].id, day(1));
  assert.equal(todaysProgress(save, day(1)).finished, true);
});

test('progress explains a habit deleted today', () => {
  // Two cards on screen, both done, but the day says 2 of 3: the third was
  // deleted today without being logged, and still counts for today.
  let save = saveWith(3);
  save = logToday(save, save.habits[0].id, day(1));
  save = logToday(save, save.habits[1].id, day(1));
  save = deleteHabit(save, save.habits[2].id, day(1));
  const progress = todaysProgress(save, day(1));
  assert.equal(progress.total, 3);
  assert.equal(progress.retiredUnlogged, 1);
});

test('the best score only ever goes up', () => {
  let save = saveWith(1);
  const id = save.monsters[0].id;
  save = recordScore(save, id, 31.27);
  assert.equal(save.monsters[0].bestScore, 31.3, 'kept to one decimal');
  save = recordScore(save, id, 12);
  assert.equal(save.monsters[0].bestScore, 31.3, 'a worse round does not replace it');
  save = recordScore(save, id, 44);
  assert.equal(save.monsters[0].bestScore, 44);
});

test('a backup keeps the best score, and rejects a bad one', () => {
  const base = saveWith(1);
  const scored = recordScore(base, base.monsters[0].id, 50);
  assert.equal(validateSave(JSON.parse(JSON.stringify(scored))).monsters[0].bestScore, 50);
  const bad = JSON.parse(JSON.stringify(scored));
  bad.monsters[0].bestScore = 140;
  assert.throws(() => validateSave(bad), /monster in the backup is malformed/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptySave, chooseStarter, addHabit, logToday, addDays, currentStreak,
  freePlayOn, replay, isAwayDay, AWAY,
} from '../js/monster.js';

const START = '2026-03-01';
const TRIP = [{ from: '2026-03-10', to: '2026-03-13' }];

function saveWith(count) {
  let save = chooseStarter(emptySave(), 'embertail', START, () => 0.5);
  for (let i = 0; i < count; i++) {
    save = addHabit(save, { name: `Habit ${i}`, type: 'check' }, START, () => (i + 1) / 10);
  }
  return save;
}

const logDays = (save, habit, from, to) => {
  for (let d = from; d <= to; d = addDays(d, 1)) save = logToday(save, save.habits[habit].id, d);
  return save;
};

test('a day away with nothing logged does not break a streak', () => {
  let save = logDays(saveWith(1), 0, '2026-03-01', '2026-03-10'); // 10 days
  // Nothing on the 11th, which is away.
  const habit = save.habits[0];
  assert.equal(currentStreak(habit, '2026-03-12', TRIP), 10, 'still 10, waiting for today');
  assert.equal(currentStreak(habit, '2026-03-12', []), 0, 'without the trip it would be broken');
  save = logToday(save, habit.id, '2026-03-12');
  assert.equal(currentStreak(save.habits[0], '2026-03-12', TRIP), 11, 'and it carries on');
});

test('the days away themselves only count when logged', () => {
  const save = logDays(saveWith(1), 0, '2026-03-01', '2026-03-09');
  // Nothing at all on the trip, then back on the 14th.
  const back = logToday(save, save.habits[0].id, '2026-03-14');
  assert.equal(currentStreak(back.habits[0], '2026-03-14', TRIP), 10);
});

test('a miss before the trip still breaks a streak', () => {
  let save = logDays(saveWith(1), 0, '2026-03-01', '2026-03-07');
  save = logDays(save, 0, '2026-03-09', '2026-03-10'); // the 8th was missed at home
  assert.equal(currentStreak(save.habits[0], '2026-03-12', TRIP), 2);
});

test('while away, one habit opens the game that same day', () => {
  let save = saveWith(3);
  assert.equal(freePlayOn(save, '2026-03-11', TRIP), false, 'nothing logged yet');
  save = logToday(save, save.habits[1].id, '2026-03-11');
  assert.equal(freePlayOn(save, '2026-03-11', TRIP), true, 'one of three is enough');
  assert.equal(freePlayOn(save, '2026-03-12', TRIP), false, 'and only that day');
});

test('at home the usual rule still applies', () => {
  let save = saveWith(3);
  save = logToday(save, save.habits[0].id, '2026-03-05');
  assert.equal(freePlayOn(save, '2026-03-05', TRIP), false);
  assert.equal(freePlayOn(save, '2026-03-06', TRIP), false);
});

test('days away cost no health', () => {
  const save = logDays(saveWith(1), 0, '2026-03-01', '2026-03-09');
  // Four empty days at home cost four points; four away cost nothing.
  assert.equal(replay(save, '2026-03-14', []).health, 1);
  assert.equal(replay(save, '2026-03-14', TRIP).health, 5);
});

test('this trip runs through Thursday', () => {
  assert.equal(isAwayDay('2026-10-03'), true, 'yesterday is covered');
  assert.equal(isAwayDay('2026-10-08'), true, 'through Thursday');
  assert.equal(isAwayDay('2026-10-09'), false);
  assert.equal(isAwayDay('2026-10-02'), false);
  assert.ok(AWAY.every((s) => s.from <= s.to));
});

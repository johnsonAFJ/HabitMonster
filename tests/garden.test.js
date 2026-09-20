import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, healthLevel, growthStage, currentStreak, latestValue,
  emptyGarden, addHabit, logToday, undoToday, deleteHabit, validateGarden, SPECIES,
} from '../js/garden.js';

const habitWith = (createdOn, days, value = true) => ({
  createdOn,
  logs: Object.fromEntries(days.map((d) => [d, value])),
});

// Days relative to a fixed start, so tests read as "day 0, day 1, ...".
const START = '2026-09-01';
const day = (n) => addDays(START, n);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i));

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('a new plant is thriving on its first day', () => {
  assert.equal(healthLevel(habitWith(START, []), START), 0);
});

test('each missed day drops health one level, bottoming out at fully wilted', () => {
  const h = habitWith(START, []);
  assert.equal(healthLevel(h, day(1)), 1);
  assert.equal(healthLevel(h, day(2)), 2);
  assert.equal(healthLevel(h, day(4)), 4);
  assert.equal(healthLevel(h, day(30)), 4);
});

test('an unwatered today does not count as missed yet', () => {
  const h = habitWith(START, [day(0), day(1)]);
  assert.equal(healthLevel(h, day(2)), 0);
});

test('recovery from fully wilted takes 4 watered days', () => {
  const h = habitWith(START, range(10, 13));
  assert.equal(healthLevel(h, day(10)), 3);
  assert.equal(healthLevel(h, day(11)), 2);
  assert.equal(healthLevel(h, day(12)), 1);
  assert.equal(healthLevel(h, day(13)), 0);
});

test('growth follows total days watered, not the streak', () => {
  assert.equal(growthStage(habitWith(START, range(0, 5))), 0);
  assert.equal(growthStage(habitWith(START, range(0, 6))), 1);
  assert.equal(growthStage(habitWith(START, [...range(0, 10), ...range(20, 29)])), 2);
  assert.equal(growthStage(habitWith(START, range(0, 44))), 3);
  assert.equal(growthStage(habitWith(START, range(0, 200))), 3);
});

test('streak stays alive until today ends', () => {
  const h = habitWith(START, range(0, 4));
  assert.equal(currentStreak(h, day(4)), 5);
  assert.equal(currentStreak(h, day(5)), 5);
  assert.equal(currentStreak(h, day(6)), 0);
});

test('latestValue returns the most recent number', () => {
  const h = { createdOn: START, logs: { [day(3)]: 181, [day(1)]: 183 } };
  assert.deepEqual(latestValue(h), { day: day(3), value: 181 });
});

test('habits get distinct species and fill free slots', () => {
  let g = emptyGarden();
  g = addHabit(g, { name: 'Walk', type: 'check' }, START);
  g = addHabit(g, { name: 'Weight', type: 'number', unit: 'lbs' }, START);
  g = addHabit(g, { name: 'Floss', type: 'check' }, START);
  assert.equal(new Set(g.habits.map((h) => h.species)).size, 3);
  assert.deepEqual(g.habits.map((h) => h.slot), [0, 1, 2]);
  assert.throws(() => addHabit(g, { name: 'Read', type: 'check' }, START));

  const [, middle] = g.habits;
  g = deleteHabit(g, middle.id);
  g = addHabit(g, { name: 'Read', type: 'check' }, START);
  const read = g.habits.find((h) => h.name === 'Read');
  assert.equal(read.slot, 1);
  assert.ok(SPECIES.includes(read.species));
});

test('logging and undo only touch today', () => {
  let g = addHabit(emptyGarden(), { name: 'Weight', type: 'number', unit: 'lbs' }, START);
  const id = g.habits[0].id;
  g = logToday(g, id, day(0), 182.4);
  g = logToday(g, id, day(1), 182.0);
  g = undoToday(g, id, day(1));
  assert.deepEqual(g.habits[0].logs, { [day(0)]: 182.4 });
});

test('validateGarden rejects malformed backups', () => {
  assert.throws(() => validateGarden({}));
  assert.throws(() => validateGarden({ habits: [{ id: 'x', name: 'a', slot: 5 }] }));
  const g = addHabit(emptyGarden(), { name: 'Walk', type: 'check' }, START);
  assert.deepEqual(validateGarden(JSON.parse(JSON.stringify(g))).habits, g.habits);
});

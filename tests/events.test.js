import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FURNITURE, FORM_LEVELS, BREADTH_MIN_LEVEL,
  levelEvents, eventSchedule, furnitureAt, formForLevel, xpForLevel, levelFromXp,
} from '../js/monster.js';
import { eventsMarkdown } from '../scripts/make-events.mjs';

// The chart promises things. These check the game keeps each promise at
// exactly the level it names, and not a level before.

test('EVENTS.md matches what the game does', () => {
  const file = readFileSync(new URL('../EVENTS.md', import.meta.url), 'utf8');
  assert.equal(file, eventsMarkdown(), 'EVENTS.md is out of date. Run `npm run events`.');
});

test('each piece of furniture arrives at exactly its level', () => {
  for (const item of FURNITURE) {
    assert.ok(furnitureAt(item.level).includes(item), `${item.id} is there at level ${item.level}`);
    assert.ok(!furnitureAt(item.level - 1).includes(item), `${item.id} is not there a level early`);
  }
});

test('each evolution in the chart is a real change of form', () => {
  for (const event of levelEvents().filter((e) => e.kind === 'evolve')) {
    assert.ok(formForLevel(event.level) > formForLevel(event.level - 1), `form changes at level ${event.level}`);
  }
});

test('stats and the breadth bonus land at the level the chart says', () => {
  const at = (kind) => levelEvents().find((e) => e.kind === kind).level;
  assert.equal(at('stats'), FORM_LEVELS[1]);
  assert.equal(at('bonus'), BREADTH_MIN_LEVEL);
});

test('no two pieces of furniture share a level', () => {
  const levels = FURNITURE.map((item) => item.level);
  assert.equal(new Set(levels).size, levels.length);
});

test('the chart lists events in level order', () => {
  const levels = levelEvents().map((e) => e.level);
  assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
});

test('the schedule is internally consistent', () => {
  let lastEarliest = 0;
  for (const event of eventSchedule()) {
    assert.equal(event.xp, xpForLevel(event.level));
    assert.equal(levelFromXp(event.xp), event.level, `${event.xp} XP is level ${event.level}`);
    assert.ok(event.earliestDay >= lastEarliest, 'later levels never come sooner');
    assert.ok(event.typicalDay >= event.earliestDay, 'typical is never faster than perfect');
    lastEarliest = event.earliestDay;
  }
});

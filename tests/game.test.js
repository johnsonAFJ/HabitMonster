import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE, HOME, RESPAWN_TICKS, UP, RIGHT, DOWN, LEFT,
  seeded, createGame, steer, step, landOf, shareOf,
} from '../js/game.js';

const at = (x, y) => y * SIZE + x;

// A round with everyone placed by hand, so each rule can be checked on a
// board we can reason about. `homes` gives each player's top-left corner.
function board(homes) {
  const [first, ...rest] = homes;
  const state = createGame({
    seed: 1,
    player: { species: 'embertail' },
    rivals: rest.map((_, i) => ({ species: i ? 'bubbletide' : 'voltectra' })),
  });
  state.owner.fill(0);
  state.trail.fill(0);
  homes.forEach(({ x, y, dir = RIGHT }, index) => {
    const p = state.players[index];
    for (let yy = y; yy < y + HOME; yy++) for (let xx = x; xx < x + HOME; xx++) state.owner[at(xx, yy)] = index + 1;
    Object.assign(p, { x: x + 1, y: y + 1, dir, alive: true, trailCells: [], queue: [], respawnAt: null });
    // Rivals that never leave home, so they stay out of the way unless a
    // test moves them deliberately.
    if (!p.human) p.personality = { reach: 0, width: 0, wait: Infinity, turn: 1, caution: 1 };
  });
  state.best = shareOf(state, 0);
  void first;
  return state;
}

// Runs one tick with the human steering `dir` first, if given.
function go(state, dir) {
  if (dir !== undefined) steer(state, dir);
  return step(state);
}

// Steers a rival by hand for the next tick, instead of its own plan.
function shove(state, index, dir) {
  steer(state, dir, index);
}

// ---- Randomness ----

test('the same seed always gives the same numbers', () => {
  const a = seeded(42);
  const b = seeded(42);
  const c = seeded(43);
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([c(), c(), c()], first);
});

test('the same seed replays a whole round exactly', () => {
  const play = (seed) => {
    const state = createGame({ seed, player: { species: 'embertail' }, rivals: [{ species: 'voltectra' }, { species: 'bubbletide' }] });
    const turns = [RIGHT, DOWN, LEFT, UP];
    for (let t = 0; t < 400 && !state.over; t++) {
      if (t % 5 === 0) steer(state, turns[(t / 5) % 4]);
      step(state);
    }
    return { owner: [...state.owner].join(''), tick: state.tick, best: state.best };
  };
  assert.deepEqual(play(7), play(7));
  assert.notDeepEqual(play(7).owner, play(8).owner, 'a different seed is a different round');
});

// ---- Setting up ----

test('everyone starts on their own separate home square', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const state = createGame({ seed, player: { species: 'embertail' }, rivals: [{ species: 'voltectra' }, { species: 'bubbletide' }] });
    state.players.forEach((p) => {
      assert.equal(landOf(state, p.index), HOME * HOME, `seed ${seed}: player ${p.index} has a full square`);
      assert.equal(state.owner[at(p.x, p.y)], p.index + 1, `seed ${seed}: standing on its own land`);
    });
  }
});

// ---- Lines ----

test('leaving your land draws a line behind you, but not under you', () => {
  const state = board([{ x: 2, y: 10 }]);
  // Standing on (3, 11) facing right. Two steps puts him at (5, 11), the
  // first cell outside his square being behind him.
  go(state);
  go(state);
  const p = state.players[0];
  assert.equal(p.x, 5);
  assert.equal(state.trail[at(4, 11)], 0, 'still his land: no line on it');
  go(state);
  assert.equal(state.trail[at(5, 11)], 1, 'the cell he left is line');
  assert.equal(state.trail[at(6, 11)], 0, 'the cell he stands on is not');
});

test('coming home claims the line and everything inside it', () => {
  const state = board([{ x: 2, y: 10 }]);
  const before = landOf(state, 0);
  // Out right three, down three, back left three, then up into his square.
  for (let i = 0; i < 4; i++) go(state);
  go(state, DOWN); go(state); go(state);
  go(state, LEFT); go(state); go(state);
  const events = go(state, UP);
  go(state);
  assert.ok(events.some((e) => e.type === 'claim') || landOf(state, 0) > before, 'it claimed');
  assert.ok(landOf(state, 0) > before + 6, 'the loop and its inside are his');
  assert.equal(state.players[0].trailCells.length, 0, 'the line is gone once claimed');
  assert.ok(state.trail.every((t) => t === 0), 'no line left anywhere');
});

test('a claim takes other monsters’ land that it walls in', () => {
  // A rival square sitting right where his loop will close round it.
  const state = board([{ x: 2, y: 2, dir: RIGHT }, { x: 7, y: 2 }]);
  const rivalBefore = landOf(state, 1);
  // Right past the rival, down below it, back left and up home.
  for (let i = 0; i < 10; i++) go(state);
  go(state, DOWN);
  for (let i = 0; i < 4; i++) go(state);
  go(state, LEFT);
  for (let i = 0; i < 9; i++) go(state);
  go(state, UP);
  for (let i = 0; i < 3; i++) go(state);
  assert.ok(landOf(state, 1) < rivalBefore, 'the rival lost the land inside his loop');
});

// ---- Getting caught ----

test('walking over your own line is fine', () => {
  const state = board([{ x: 2, y: 10 }]);
  for (let i = 0; i < 4; i++) go(state);
  go(state, DOWN); go(state);
  go(state, LEFT); go(state);
  go(state, UP); // up to (5, 12): still clear of the line
  const events = go(state); // and onto (5, 11), which is his line
  go(state); // and off the other side
  assert.ok(!events.some((e) => e.type === 'out'));
  assert.equal(state.players[0].alive, true);
  assert.equal(state.over, false);
  const p = state.players[0];
  assert.equal(new Set(p.trailCells).size, p.trailCells.length, 'each line cell is listed once');
});

test('a rival crossing his line puts him out', () => {
  const state = board([{ x: 2, y: 10 }, { x: 8, y: 2, dir: DOWN }]);
  for (let i = 0; i < 6; i++) go(state); // his line now runs along row 11
  // March the rival down onto it.
  let events = [];
  for (let i = 0; i < 12 && !state.over; i++) {
    shove(state, 1, DOWN);
    events = go(state);
  }
  assert.equal(state.over, true);
  assert.ok(events.some((e) => e.type === 'out' && e.player === 0 && e.by === 1));
});

// Lays a rival's line along a row by hand, with the rival parked against
// the right-hand wall so it cannot wander off and spoil the setup.
function layLine(state, index, row, fromX, toX) {
  const p = state.players[index];
  for (let x = fromX; x <= toX; x++) {
    state.trail[at(x, row)] |= 1 << index;
    p.trailCells.push(at(x, row));
  }
  Object.assign(p, { x: SIZE - 1, y: row, dir: RIGHT });
  steer(state, RIGHT, index); // scripted, and walking into the wall: stays put
}

test('crossing a rival’s line puts it out, and its land disappears', () => {
  // His home in the top-left corner; the rival's line right across row 11.
  const state = board([{ x: 0, y: 0, dir: DOWN }, { x: 19, y: 2 }]);
  layLine(state, 1, 11, 1, 22);
  let events = [];
  for (let i = 0; i < 12 && state.players[1].alive; i++) events = go(state);
  assert.equal(state.players[1].alive, false, 'he walked down column 1 across its line');
  assert.ok(events.some((e) => e.type === 'out' && e.player === 1 && e.by === 0));
  assert.equal(landOf(state, 1), 0, 'its land is gone');
  assert.ok(state.trail.every((t) => !(t & 2)), 'and so is its line');
  assert.equal(state.over, false, 'the round carries on');
});

test('a rival that is out comes back on a new square', () => {
  const state = board([{ x: 0, y: 0, dir: DOWN }, { x: 19, y: 2 }]);
  layLine(state, 1, 11, 1, 22);
  for (let i = 0; i < 12 && state.players[1].alive; i++) go(state);
  // Bring him home along column 2, then park him against the top wall on
  // his own land, where nothing can touch him.
  go(state, RIGHT);
  for (let i = 0; i < 12; i++) go(state, UP);
  assert.equal(state.players[0].trailCells.length, 0, 'home, with no line out');
  let back = false;
  for (let i = 0; i <= RESPAWN_TICKS + 2; i++) {
    if (go(state, UP).some((e) => e.type === 'back' && e.player === 1)) back = true;
  }
  assert.equal(back, true, 'it came back');
  assert.equal(landOf(state, 1), HOME * HOME, 'on a fresh square');
  assert.equal(state.players[0].alive, true);
});

test('monsters walk straight through each other', () => {
  // He walks right along row 11; the rival walks down column 9. They reach
  // (9, 11) on the same tick and both carry on.
  const state = board([{ x: 2, y: 10, dir: RIGHT }, { x: 8, y: 4, dir: DOWN }]);
  for (let i = 0; i < 6; i++) { shove(state, 1, DOWN); go(state); }
  assert.deepEqual([state.players[0].x, state.players[0].y], [9, 11]);
  assert.deepEqual([state.players[1].x, state.players[1].y], [9, 11], 'on the same cell');
  for (let i = 0; i < 4; i++) { shove(state, 1, DOWN); go(state); }
  assert.equal(state.players[0].alive, true, 'he is fine');
  assert.equal(state.players[1].alive, true, 'and so is the rival');
});

test('a cell two lines pass through belongs to both', () => {
  // The bug: both stepping off the same cell, the second overwrote the
  // first, leaving an invisible gap in his line.
  const state = board([{ x: 2, y: 10, dir: RIGHT }, { x: 8, y: 4, dir: DOWN }]);
  for (let i = 0; i < 7; i++) { shove(state, 1, DOWN); go(state); }
  assert.equal(state.trail[at(9, 11)], 0b11, 'his line and the rival’s both run through it');
});

test('walking head-on along a rival’s line puts you both out', () => {
  // Passing through each other is fine, but walking on means stepping onto
  // the line just behind the other monster, and it onto yours.
  const state = board([{ x: 2, y: 10, dir: RIGHT }, { x: 14, y: 10, dir: LEFT }]);
  let events = [];
  for (let i = 0; i < 12 && state.players[1].alive; i++) {
    shove(state, 1, LEFT);
    events = events.concat(go(state));
  }
  assert.equal(state.players[0].alive, false);
  assert.equal(state.players[1].alive, false);
  assert.equal(events.filter((e) => e.type === 'out').length, 2, 'both on the same tick');
});

// ---- Saying why ----

test('a loop drawn across his own line is his once he gets home', () => {
  const state = board([{ x: 2, y: 10 }]);
  for (let i = 0; i < 6; i++) go(state); // out along row 11 to (8, 11)
  go(state, DOWN); go(state); go(state); // down to (8, 14)
  go(state, LEFT); go(state); go(state); // left to (5, 14)
  go(state, UP); go(state); go(state); go(state); // up across his line to (5, 10)
  assert.equal(state.players[0].alive, true);
  go(state, LEFT); go(state); // back home at (3, 10)
  // (7, 12) to (8, 13) sit inside the loop, touched by no line at all.
  for (const [x, y] of [[7, 12], [8, 12], [7, 13], [8, 13]]) {
    assert.equal(state.owner[at(x, y)], 1, `(${x}, ${y}) is inside the loop and his`);
  }
});

test('a rival crossing his line is named', () => {
  const state = board([{ x: 2, y: 10 }, { x: 8, y: 2, dir: DOWN }]);
  for (let i = 0; i < 6; i++) go(state);
  let out = null;
  for (let i = 0; i < 12 && !state.over; i++) {
    shove(state, 1, DOWN);
    out = go(state).find((e) => e.type === 'out' && e.player === 0) ?? out;
  }
  assert.deepEqual({ by: out.by, cause: out.cause }, { by: 1, cause: 'line' });
});

test('a rival that encloses all his land puts him out, and is named', () => {
  // The one that needs no touching at all: a rival closes a ring round his
  // whole square, and every cell he had becomes the rival's.
  const state = board([{ x: 10, y: 10 }, { x: 2, y: 2 }]);
  const rival = state.players[1];
  state.owner[at(8, 8)] = 2; // the rival's land, where the ring closes
  const ring = [];
  for (let x = 9; x <= 14; x++) ring.push([x, 8]);
  for (let y = 9; y <= 14; y++) ring.push([14, y]);
  for (let x = 13; x >= 8; x--) ring.push([x, 14]);
  for (let y = 13; y >= 10; y--) ring.push([8, y]);
  for (const [x, y] of ring) {
    state.trail[at(x, y)] |= 2;
    rival.trailCells.push(at(x, y));
  }
  Object.assign(rival, { x: 8, y: 9, dir: UP });
  steer(state, UP, 1); // one step up onto its own land closes the ring
  const out = go(state).find((e) => e.type === 'out' && e.player === 0);
  assert.ok(out, 'he is out');
  assert.deepEqual({ by: out.by, cause: out.cause }, { by: 1, cause: 'land' });
  assert.equal(state.over, true);
});

// ---- The edge and turning ----

test('the edge is a wall, not a way out', () => {
  const state = board([{ x: SIZE - 4, y: 10, dir: RIGHT }]);
  for (let i = 0; i < 10; i++) go(state);
  const p = state.players[0];
  assert.equal(p.alive, true);
  assert.equal(p.x, SIZE - 1, 'he stops at the edge');
});

test('turning straight back is ignored while dragging a line', () => {
  const state = board([{ x: 2, y: 10, dir: RIGHT }]);
  for (let i = 0; i < 4; i++) go(state);
  go(state, LEFT);
  const p = state.players[0];
  assert.equal(p.dir, RIGHT, 'would have walked into his own line');
  assert.equal(p.alive, true);
});

test('turning straight back is fine on his own land', () => {
  const state = board([{ x: 2, y: 10, dir: RIGHT }]);
  go(state, LEFT);
  assert.equal(state.players[0].dir, LEFT);
  assert.equal(state.players[0].alive, true);
});

test('two quick turns both land', () => {
  const state = board([{ x: 2, y: 10, dir: RIGHT }]);
  for (let i = 0; i < 3; i++) go(state);
  steer(state, DOWN);
  steer(state, LEFT);
  go(state);
  assert.equal(state.players[0].dir, DOWN);
  go(state);
  assert.equal(state.players[0].dir, LEFT, 'the second press was kept, not lost');
});

// ---- Scoring ----

test('milestones each fire once, and the best share is kept', () => {
  const state = board([{ x: 2, y: 2, dir: RIGHT }]);
  // Hand him most of the board, then let a tick notice it.
  for (let c = 0; c < SIZE * SIZE; c++) if (c % SIZE < 18) state.owner[c] = 1;
  const events = go(state);
  const hit = events.filter((e) => e.type === 'milestone').map((e) => e.percent);
  assert.deepEqual(hit, [25, 50, 75]);
  assert.ok(state.best >= 75);
  assert.equal(go(state).filter((e) => e.type === 'milestone').length, 0, 'not again');
});

test('losing every bit of your land puts you out', () => {
  const state = board([{ x: 2, y: 2 }, { x: 12, y: 12 }]);
  state.owner.fill(0, 0, SIZE * SIZE);
  for (let c = 0; c < SIZE * SIZE; c++) if (c % SIZE > 10) state.owner[c] = 1;
  const events = go(state);
  assert.equal(state.players[1].alive, false, 'nothing left to come home to');
  assert.ok(events.some((e) => e.type === 'out' && e.player === 1));
});

// ---- Winning ----

test('taking the whole board wins', () => {
  // The bug: a round only ended by getting caught, so a full board just sat
  // there with him walking round it forever.
  const state = board([{ x: 2, y: 2 }, { x: 12, y: 12 }, { x: 18, y: 4 }]);
  state.owner.fill(1);
  const events = go(state);
  const win = events.find((e) => e.type === 'win');
  assert.ok(win, 'it is a win');
  assert.equal(win.reason, 'board');
  assert.equal(state.over, true);
  assert.equal(state.won, true);
  assert.equal(Math.round(state.best), 100);
});

test('both rivals out with nowhere to come back is a win', () => {
  // Nearly all his, with only scattered single cells left: no room for a
  // rival's 3 x 3 square, so nobody can ever come back to play.
  const state = board([{ x: 2, y: 2 }, { x: 12, y: 12 }, { x: 18, y: 4 }]);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) state.owner[at(x, y)] = x % 3 === 1 && y % 3 === 1 ? 0 : 1;
  }
  state.owner[at(3, 3)] = 1; // where he is standing
  for (const p of state.players.slice(1)) Object.assign(p, { alive: false, respawnAt: 999 });
  const win = go(state).find((e) => e.type === 'win');
  assert.ok(win, 'it is a win');
  assert.equal(win.reason, 'nowhere');
  assert.ok(state.best < 100, 'without owning every cell');
});

test('both rivals out with room to come back is not a win', () => {
  const state = board([{ x: 2, y: 2 }, { x: 12, y: 12 }, { x: 18, y: 4 }]);
  for (const p of state.players.slice(1)) {
    for (let c = 0; c < SIZE * SIZE; c++) if (state.owner[c] === p.index + 1) state.owner[c] = 0;
    Object.assign(p, { alive: false, respawnAt: state.tick + 2 });
  }
  assert.equal(go(state).some((e) => e.type === 'win'), false, 'plenty of room: they will be back');
  let back = 0;
  for (let i = 0; i < 4; i++) back += go(state, [RIGHT, DOWN, LEFT, UP][i]).filter((e) => e.type === 'back').length;
  assert.equal(back, 2, 'and they were');
  assert.equal(state.over, false);
});

test('the room check finds a square the random search could miss', () => {
  // A crowded board with exactly one free 3 x 3 square left. The win check
  // and a respawn have to agree on it, or a rival could be declared gone
  // while a spot still existed.
  const state = board([{ x: 2, y: 2 }, { x: 12, y: 12 }]);
  state.owner.fill(1);
  for (let y = 16; y < 19; y++) for (let x = 16; x < 19; x++) state.owner[at(x, y)] = 0;
  const rival = state.players[1];
  Object.assign(rival, { alive: false, respawnAt: state.tick + 1 });
  const events = go(state);
  assert.equal(events.some((e) => e.type === 'win'), false);
  assert.ok(go(state).some((e) => e.type === 'back') || rival.alive, 'it found the one square left');
});

// ---- Rivals actually play ----

test('rivals claim land on their own over a round', () => {
  // Across many seeds, rivals should regularly grow beyond their start square:
  // a bot that just wanders and never closes a loop would never manage it.
  let grew = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame({ seed, player: { species: 'embertail' }, rivals: [{ species: 'voltectra' }, { species: 'bubbletide' }] });
    // Keep him safely circling at home so the round runs its course.
    let peak = 0;
    for (let t = 0; t < 300 && !state.over; t++) {
      steer(state, [RIGHT, DOWN, LEFT, UP][Math.floor(t / 2) % 4]);
      step(state);
      peak = Math.max(peak, landOf(state, 1), landOf(state, 2));
    }
    if (peak > HOME * HOME) grew++;
  }
  assert.ok(grew >= 16, `rivals grew in ${grew} of 20 rounds`);
});

test('rivals do not walk into their own lines', () => {
  let selfOut = 0;
  let outs = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame({ seed, player: { species: 'embertail' }, rivals: [{ species: 'voltectra' }, { species: 'bubbletide' }] });
    for (let t = 0; t < 300 && !state.over; t++) {
      steer(state, [RIGHT, DOWN, LEFT, UP][Math.floor(t / 2) % 4]);
      for (const e of step(state)) {
        if (e.type !== 'out' || e.player === 0) continue;
        outs++;
        if (e.by === null) selfOut++;
      }
    }
  }
  assert.ok(selfOut <= Math.max(2, outs * 0.2), `${selfOut} of ${outs} rival outs were self-inflicted`);
});

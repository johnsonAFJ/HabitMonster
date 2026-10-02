// The territory game: rules only, no drawing. Like monster.js, nothing here
// touches the DOM, so a whole round can be played and checked in Node.
//
// Everything random goes through the round's own seeded generator, so a seed
// replays a round exactly. That is what makes the fill and the collisions
// testable: a failing round can be pinned and kept.
//
// The rules, in the order a seven-year-old would explain them:
//   - Leave your land and you draw a line behind you.
//   - Get back to your land and everything inside the loop is yours,
//     including other monsters' land.
//   - If anyone touches your line, you are out. That includes you.
//   - Monsters walk straight through each other. Only lines matter.
//   - The edge is a wall.

export const SIZE = 24;
export const TICKS_PER_SECOND = 7;
export const HOME = 3; // the starting square is HOME x HOME
export const RESPAWN_TICKS = 3 * TICKS_PER_SECOND;
export const MILESTONES = [25, 50, 75];

export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const opposite = (dir) => (dir + 2) % 4;

// ---- Seeded randomness ----

// mulberry32: small, fast, and good enough for bot personalities.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// ---- The board ----

const cellOf = (x, y) => y * SIZE + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

// owner holds a player number plus one, so 0 can mean "nobody".
//
// trail is a bitmask instead, one bit per player, because two lines can pass
// through the same cell: two monsters standing on one cell and then both
// stepping off it each leave it as part of their own line. With one owner per
// cell the second would overwrite the first, leaving an invisible gap.
const mark = (player) => player.index + 1;
const bit = (player) => 1 << player.index;

export function landOf(state, index) {
  const id = index + 1;
  let n = 0;
  for (const owner of state.owner) if (owner === id) n++;
  return n;
}

export function shareOf(state, index) {
  return (landOf(state, index) / (SIZE * SIZE)) * 100;
}

// Can a HOME x HOME square go with its top-left corner here? Every cell has
// to be empty, and its middle at least `margin` steps from anyone alive.
function fits(state, x, y, margin) {
  for (let yy = y; yy < y + HOME; yy++) {
    for (let xx = x; xx < x + HOME; xx++) {
      const c = cellOf(xx, yy);
      if (state.owner[c] || state.trail[c]) return false;
    }
  }
  return state.players.every((p) => !p.alive || Math.abs(p.x - (x + 1)) + Math.abs(p.y - (y + 1)) > margin);
}

// The first square that fits anywhere, searched in order. This is the final
// word on whether there is room, so the win check and a respawn can never
// disagree about it.
function firstFree(state) {
  for (let y = 1; y <= SIZE - HOME - 1; y++) {
    for (let x = 1; x <= SIZE - HOME - 1; x++) {
      if (fits(state, x, y, 0)) return { x, y };
    }
  }
  return null;
}

// A free square, away from everyone, for a start or a respawn. Random tries
// first, preferring room to breathe, so starts vary from round to round;
// then the full search, so a crowded board still finds a spot if one exists.
function findHome(state) {
  for (const margin of [6, 3, 0]) {
    for (let tries = 0; tries < 200; tries++) {
      const x = between(state.rand, 1, SIZE - HOME - 1);
      const y = between(state.rand, 1, SIZE - HOME - 1);
      if (fits(state, x, y, margin)) return { x, y };
    }
  }
  return firstFree(state);
}

function placeAt(state, player, corner) {
  const id = mark(player);
  for (let y = corner.y; y < corner.y + HOME; y++) {
    for (let x = corner.x; x < corner.x + HOME; x++) state.owner[cellOf(x, y)] = id;
  }
  player.x = corner.x + 1;
  player.y = corner.y + 1;
  player.alive = true;
  player.trailCells = [];
  player.queue = [];
  // Start facing the middle of the board, where the room is.
  const towardX = SIZE / 2 - player.x;
  const towardY = SIZE / 2 - player.y;
  player.dir = Math.abs(towardX) > Math.abs(towardY) ? (towardX > 0 ? RIGHT : LEFT) : towardY > 0 ? DOWN : UP;
}

// ---- Rivals' personalities ----

// Rolled fresh every round, so the same two rivals play differently each
// time. Nothing here makes them chase him: danger comes from crossing paths.
function rollPersonality(rand) {
  return {
    reach: between(rand, 2, 7), // how far it ventures out
    width: between(rand, 2, 6), // how wide a loop it draws
    wait: between(rand, 0, 8), // how long it potters at home between loops
    turn: rand() < 0.5 ? 1 : 3, // which way it bends: clockwise or not
    caution: rand(), // how hard it tries to stay off other lines
  };
}

// ---- Setting up a round ----

export function createGame({ seed, player, rivals = [] }) {
  const state = {
    seed,
    rand: seeded(seed),
    owner: new Uint8Array(SIZE * SIZE),
    trail: new Uint8Array(SIZE * SIZE),
    players: [],
    tick: 0,
    over: false,
    won: false,
    best: 0,
    reached: new Set(),
  };
  const everyone = [{ ...player, human: true }, ...rivals.map((r) => ({ ...r, human: false }))];
  everyone.forEach((who, index) => {
    const p = {
      index,
      species: who.species,
      human: who.human,
      alive: false,
      x: 0,
      y: 0,
      dir: RIGHT,
      queue: [],
      trailCells: [],
      respawnAt: null,
      personality: who.human ? null : rollPersonality(state.rand),
      plan: { phase: 'home', legs: 0, wait: 0 },
    };
    state.players.push(p);
    placeAt(state, p, findHome(state));
  });
  state.best = shareOf(state, 0);
  return state;
}

// ---- Steering ----

// Up to two turns are queued, so a quick "right then up" at a corner both
// land instead of the second press eating the first.
//
// Steering anyone but player 0 makes them scripted: they follow the queue
// instead of their own plan. Tests use that to put a rival exactly where a
// rule needs checking.
export function steer(state, dir, index = 0) {
  const p = state.players[index];
  if (!p || !p.alive || state.over) return;
  if (index !== 0) p.scripted = true;
  const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir;
  if (dir === last) return;
  if (p.queue.length >= 2) p.queue.shift();
  p.queue.push(dir);
}

// Turning straight back is ignored only while dragging a line: it would
// just walk back along the line. On his own land it is harmless.
function canFace(player, dir) {
  return !(player.trailCells.length && dir === opposite(player.dir));
}

function nextHumanDir(player) {
  while (player.queue.length) {
    const dir = player.queue.shift();
    if (canFace(player, dir)) return dir;
  }
  return player.dir;
}

// ---- Rival behaviour ----

function standingOn(state, p) {
  return state.owner[cellOf(p.x, p.y)];
}

// Manhattan distance from (x, y) to the nearest cell this player owns.
function distanceHome(state, p, x, y) {
  const id = mark(p);
  let best = Infinity;
  for (let c = 0; c < state.owner.length; c++) {
    if (state.owner[c] !== id) continue;
    const d = Math.abs((c % SIZE) - x) + Math.abs(Math.floor(c / SIZE) - y);
    if (d < best) best = d;
  }
  return best;
}

// The directions a rival could take next: never off the board, never back on
// its own line, and if it is careful, not across anyone else's either.
function safeDirs(state, p) {
  const own = bit(p);
  const candidates = [p.dir, (p.dir + 1) % 4, (p.dir + 3) % 4];
  if (!p.trailCells.length) candidates.push(opposite(p.dir));
  const ok = candidates.filter((dir) => {
    const x = p.x + DX[dir];
    const y = p.y + DY[dir];
    return inBounds(x, y) && !(state.trail[cellOf(x, y)] & own);
  });
  const careful = ok.filter((dir) => !(state.trail[cellOf(p.x + DX[dir], p.y + DY[dir])] & ~own));
  return state.rand() < p.personality.caution && careful.length ? careful : ok;
}

function nextRivalDir(state, p) {
  const traits = p.personality;
  const plan = p.plan;
  const home = standingOn(state, p) === mark(p) && !p.trailCells.length;
  const options = safeDirs(state, p);
  if (!options.length) return p.dir; // boxed in; it will have to take its chances

  const prefer = (dir) => (options.includes(dir) ? dir : null);

  if (home) {
    if (plan.phase !== 'home') {
      plan.phase = 'home';
      plan.wait = traits.wait;
    }
    if (plan.wait > 0) {
      plan.wait--;
      // Potter about inside its own land.
      const stay = options.filter((dir) => state.owner[cellOf(p.x + DX[dir], p.y + DY[dir])] === mark(p));
      if (stay.length) return stay.includes(p.dir) ? p.dir : stay[Math.floor(state.rand() * stay.length)];
    }
    // Head out, towards open ground.
    plan.phase = 'out';
    plan.legs = traits.reach;
    const out = options.filter((dir) => state.owner[cellOf(p.x + DX[dir], p.y + DY[dir])] !== mark(p));
    return out.length ? out[Math.floor(state.rand() * out.length)] : options[0];
  }

  if (plan.phase === 'out' || plan.phase === 'across') {
    if (plan.legs > 0 && prefer(p.dir) !== null) {
      plan.legs--;
      return p.dir;
    }
    // End of a leg, or the wall: bend the same way every time, so the loop
    // closes back on itself instead of wandering off.
    plan.phase = plan.phase === 'out' ? 'across' : 'back';
    plan.legs = traits.width;
    const bent = (p.dir + traits.turn) % 4;
    if (prefer(bent) !== null) return bent;
  }

  // On the way back: whichever safe direction gets closest to home.
  plan.phase = 'back';
  let best = options[0];
  let bestDistance = Infinity;
  for (const dir of options) {
    const d = distanceHome(state, p, p.x + DX[dir], p.y + DY[dir]);
    if (d < bestDistance || (d === bestDistance && dir === p.dir)) {
      best = dir;
      bestDistance = d;
    }
  }
  return best;
}

// ---- Claiming land ----

// The line becomes land, and so does everything it encloses. Flood in from
// the edge of the board over every cell that is not this player's: whatever
// the flood cannot reach is walled in by this player's land, and is theirs —
// even if it belonged to someone else.
function claim(state, p) {
  const id = mark(p);
  for (const c of p.trailCells) {
    state.owner[c] = id;
    state.trail[c] &= ~bit(p);
  }
  p.trailCells = [];

  const reached = new Uint8Array(SIZE * SIZE);
  const stack = [];
  const visit = (c) => {
    if (!reached[c] && state.owner[c] !== id) {
      reached[c] = 1;
      stack.push(c);
    }
  };
  for (let i = 0; i < SIZE; i++) {
    visit(cellOf(i, 0));
    visit(cellOf(i, SIZE - 1));
    visit(cellOf(0, i));
    visit(cellOf(SIZE - 1, i));
  }
  while (stack.length) {
    const c = stack.pop();
    const x = c % SIZE;
    const y = Math.floor(c / SIZE);
    if (x > 0) visit(c - 1);
    if (x < SIZE - 1) visit(c + 1);
    if (y > 0) visit(c - SIZE);
    if (y < SIZE - 1) visit(c + SIZE);
  }
  for (let c = 0; c < SIZE * SIZE; c++) {
    if (!reached[c] && state.owner[c] !== id) state.owner[c] = id;
  }
}

// Out: its land and its line both vanish, which is the reward for catching
// it — a big piece of the board opens up at once.
//
// `cause` says how, so the end of a round can tell him: 'line' (someone
// crossed it), or 'land' (someone took
// every cell he had, which needs no touching at all and was otherwise the
// most baffling way to lose).
function knockOut(state, p, events, by, cause) {
  if (!p.alive) return;
  const id = mark(p);
  for (let c = 0; c < SIZE * SIZE; c++) {
    if (state.owner[c] === id) state.owner[c] = 0;
    state.trail[c] &= ~bit(p);
  }
  p.alive = false;
  p.trailCells = [];
  p.queue = [];
  p.respawnAt = p.human ? null : state.tick + RESPAWN_TICKS;
  events.push({ type: 'out', player: p.index, by: by ?? null, cause });
  if (p.human) state.over = true;
}

// ---- One tick ----

// Everyone decides, everyone moves, then the lines they touched are settled,
// all against the board as it stood before this tick. Two monsters crossing
// each other's lines on the same tick are both out, whatever order they were
// listed in.
export function step(state) {
  const events = [];
  if (state.over) return events;
  state.tick++;

  const moves = [];
  for (const p of state.players) {
    if (!p.alive) continue;
    p.dir = p.human || p.scripted ? nextHumanDir(p) : nextRivalDir(state, p);
    const x = p.x + DX[p.dir];
    const y = p.y + DY[p.dir];
    // The edge is a wall: walk into it and you just stand there.
    if (inBounds(x, y)) moves.push({ p, x, y, from: cellOf(p.x, p.y), to: cellOf(x, y) });
  }

  // Lines are settled against the board as it was, before anyone moved.
  const out = new Map();
  for (const m of moves) {
    const lines = state.trail[m.to];
    if (!lines) continue;
    for (const owner of state.players) {
      // Your own line never puts you out. He asked to be able to cross it,
      // and a loop inside the loop is still claimed when he gets home.
      if (owner === m.p) continue;
      if (lines & bit(owner) && !out.has(owner)) out.set(owner, m.p.index);
    }
  }
  for (const [p, by] of out) knockOut(state, p, events, by, 'line');

  for (const m of moves) {
    const p = m.p;
    if (!p.alive) continue;
    const id = mark(p);
    // The cell being left joins the line if it is not this player's land.
    // The cell being stood on never does, which is why monsters can walk
    // through each other.
    if (state.owner[m.from] !== id && !(state.trail[m.from] & bit(p))) {
      state.trail[m.from] |= bit(p);
      p.trailCells.push(m.from);
    }
    p.x = m.x;
    p.y = m.y;
    if (state.owner[m.to] === id && p.trailCells.length) {
      claim(state, p);
      events.push({ type: 'claim', player: p.index });
      // Anyone whose last cell that claim took is out, and it was this
      // player who did it.
      for (const q of state.players) {
        if (q !== p && q.alive && landOf(state, q.index) === 0) knockOut(state, q, events, p.index, 'land');
      }
    }
  }

  // A monster whose land was taken entirely has nowhere to come back to.
  // Claims catch this as they happen; this catches anything left over.
  for (const p of state.players) {
    if (p.alive && landOf(state, p.index) === 0) knockOut(state, p, events, null, 'land');
  }

  for (const p of state.players) {
    if (p.alive || p.human || p.respawnAt === null || state.tick < p.respawnAt) continue;
    const corner = findHome(state);
    if (!corner) continue; // no room yet; try again next tick
    p.personality = rollPersonality(state.rand);
    p.plan = { phase: 'home', legs: 0, wait: 0 };
    placeAt(state, p, corner);
    p.respawnAt = null;
    events.push({ type: 'back', player: p.index });
  }

  if (!state.over) {
    const share = shareOf(state, 0);
    if (share > state.best) state.best = share;
    for (const m of MILESTONES) {
      if (share >= m && !state.reached.has(m)) {
        state.reached.add(m);
        events.push({ type: 'milestone', percent: m });
      }
    }

    // A win. Without this a round only ended by getting caught, so taking the
    // whole board left him walking round it forever: the rivals had no land,
    // so they were out, and no room, so they could never come back. Either
    // of those is the end — the second stops a board that is nearly all his
    // from stalling with nobody left to play against.
    const rivalsGone = state.players.every((p) => p.human || !p.alive);
    if (share >= 100 || (rivalsGone && !firstFree(state))) {
      state.over = true;
      state.won = true;
      events.push({ type: 'win', reason: share >= 100 ? 'board' : 'nowhere' });
    }
  }
  return events;
}
